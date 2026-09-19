/**
 * One conversation, running. Owns the lane, the session and the workspace-scoped execution
 * environment, translates harness events into runtime events, and reports the failures the
 * harness returns as values rather than throws (ADR-0001).
 */

import {
  type ApprovalAsk,
  type Attachment,
  type ChatMessage,
  imagesOf,
  type PermissionLevel,
  type PermissionRule,
  type RuntimeEvent,
  textOfContent,
  type Undef,
  type UsageTotals,
} from '@alpha/core'
import {
  AgentHarness,
  type AgentHarnessTool,
  type AgentLane,
  BACKGROUND_CONTEXT,
  type Entry,
  type HarnessEventType,
  type JsonlSessionMetadata,
  type Session,
  type ThinkingLevel,
} from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import type { Api, Model } from '@earendil-works/pi-ai'
import { DecisionLedger } from './decisions.ts'
import type { ApprovalAnswer } from './gate.ts'
import { createToolGate } from './gate.ts'
import type { ModelRuntime } from './models.ts'
import { openSession, type SessionReader, tipPathOf } from './session-reader.ts'
import { createWorkspaceTools, workspaceToolNames } from './tools.ts'
import { createEventTranslator } from './translate.ts'

/** How the gate reaches the policy and the person: all four are read at the moment of a call. */
export interface PermissionPorts {
  level: (conversationId: string) => PermissionLevel
  rules: () => PermissionRule[]
  remember: (rule: PermissionRule) => void
  ask: (conversationId: string, ask: ApprovalAsk) => Promise<ApprovalAnswer>
}

export interface OpenConversationOptions {
  /** Minted by the caller before the runtime exists, so the ledger can be opened for it first. */
  conversationId: string
  workspacePath: string
  sessionsRoot: string
  modelRuntime: ModelRuntime
  /** Which model this conversation runs on; falls back to the runtime's default. */
  model?: Model<Api>
  systemPrompt: string
  /** Present when reopening a conversation that is already on disk. */
  sessionMetadata?: JsonlSessionMetadata
  tools?: AgentHarnessTool<object>[]
  toolNames?: string[]
  /** Absent only in tests that want the gate out of the way; every real conversation has one. */
  permissions?: PermissionPorts
  /** How earlier calls got past the gate, and where the next decision is written (decisions.ts). */
  decisions?: DecisionLedger
  emit: (event: RuntimeEvent) => void
}

export interface OpenedRuntime {
  runtime: ConversationRuntime
  conversationId: string
  messages: ChatMessage[]
}

const SUBSCRIBED_EVENTS: HarnessEventType[] = [
  'turn_start',
  'message_start',
  'message_update',
  'message_end',
  'tool_start',
  'tool_update',
  'tool_end',
  'queue_update',
  'usage',
  'compaction_end',
  'run_end',
  'fault',
]

export class ConversationRuntime {
  readonly #harness: AgentHarness<object>
  readonly #lane: AgentLane
  readonly #session: Session<JsonlSessionMetadata>
  readonly #reader: SessionReader
  readonly #emit: (event: RuntimeEvent) => void
  /** Whether a run is in flight, which the lane's own record cannot answer: see `isRunning`. */
  #running = false

  private constructor(
    harness: AgentHarness<object>,
    lane: AgentLane,
    reader: SessionReader,
    emit: (event: RuntimeEvent) => void,
  ) {
    this.#harness = harness
    this.#lane = lane
    this.#session = reader.session
    this.#reader = reader
    this.#emit = emit
  }

  static async open(options: OpenConversationOptions): Promise<OpenedRuntime> {
    const env = new NodeExecutionEnv({ cwd: options.workspacePath })
    // The ledger is handed to the reader as well as to the gate: the transcript a runtime opens
    // with is the same one the window sees a second later, decisions and all. With none handed in
    // the gate still records what it decided; the notes simply do not outlive the run.
    const decisions = options.decisions ?? new DecisionLedger()
    const reader = await openSession(
      {
        sessionsRoot: options.sessionsRoot,
        workspacePath: options.workspacePath,
        conversationId: options.conversationId,
      },
      { create: true, decisions },
    )
    if (reader === undefined) throw new Error('could not open a session for this conversation')
    const session = reader.session

    const model = options.model ?? options.modelRuntime.defaultModel
    if (model === undefined) {
      throw new Error('No model is configured. Add a provider and a model in Settings first.')
    }

    const { harness } = await AgentHarness.create(
      {
        session,
        models: options.modelRuntime.models,
        model,
        systemPrompt: options.systemPrompt,
        tools: options.tools ?? createWorkspaceTools(),
        activeToolNames: options.toolNames ?? workspaceToolNames(),
        toolContext: { env },
      },
      BACKGROUND_CONTEXT,
    )

    // `lane()` is async: acquiring a lane is an admission step, not a lookup.
    const lane = await harness.lane('main', BACKGROUND_CONTEXT)
    const conversationId = session.metadata.id
    const runtime = new ConversationRuntime(harness, lane, reader, options.emit)
    const translator = createEventTranslator(conversationId, (callId) => decisions.get(callId))
    for (const type of SUBSCRIBED_EVENTS) {
      harness.events.on(type, (event) => {
        for (const translated of translator.translate(event)) runtime.#emit(translated)
      })
    }
    harness.events.on('run_start', () => {
      runtime.#running = true
    })
    // A fault ends the run in the translator's terms, so it ends it here too.
    harness.events.on('run_end', () => {
      runtime.#running = false
    })
    harness.events.on('fault', () => {
      runtime.#running = false
    })

    // A run that was in flight when the process died is still "current" on the lane, and the lane
    // refuses to navigate while anything is current — so the conversation could never be edited
    // again. Nothing is driving that run here, which makes it over: settling it now, before the
    // window can ask for anything, is what lets the next edit land.
    const unsettled = (await lane.inspectExecution(BACKGROUND_CONTEXT)).current !== null
    if (unsettled) await lane.abort(BACKGROUND_CONTEXT)
    // A compaction is not a message event: it is a structural change whose summary has an entry of
    // its own, so the runtime reads that entry and tells the window what it stands for.
    harness.events.on('compaction_end', (event) => {
      if (event.status !== 'completed') return
      void compactionSummary(session, event.entryId).then((summary) =>
        runtime.#emit({
          conversationId,
          type: 'history_compacted',
          ...summary,
          at: event.endedAt,
        }),
      )
    })
    if (options.permissions !== undefined) {
      const gate = createToolGate({
        ...options.permissions,
        conversationId,
        workspacePath: options.workspacePath,
        note: (callId, record) => decisions.note(callId, record),
      })
      harness.hooks.on('before_tool', (event) => gate(event))
    }

    return { runtime, conversationId, messages: await reader.transcript() }
  }

  async prompt(text: string, attachments?: Attachment[]): Promise<void> {
    const result = await this.#lane.prompt(text, imagesOf(attachments), BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
  }

  /** Summarises the history now, which is the same work the runtime does when it runs out of room. */
  async compact(): Promise<boolean> {
    const result = await this.#lane.compact(undefined, BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
    return result.ok
  }

  /**
   * Whether a run is in flight, read from the events the runtime already translates rather than
   * from what the window was told.
   *
   * The lane's own record cannot answer it: an operation that was admitted and never settled —
   * the window was closed mid-turn — stays "current" forever, and would hold an edit against the
   * user after a relaunch. This starts false for every runtime, so a run is in flight exactly
   * when this process is running it.
   */
  isRunning(): boolean {
    return this.#running
  }

  async abort(): Promise<void> {
    const result = await this.#lane.abort(BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
  }

  /** A message for the running turn: it arrives now, and changes what the agent does next. */
  async steer(text: string): Promise<void> {
    const result = await this.#lane.steer(text, undefined, BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
  }

  /** A message for after the running turn: it waits, and can be taken back until then. */
  async followUp(text: string): Promise<void> {
    const result = await this.#lane.followUp(text, undefined, BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
  }

  async cancelQueued(entryId: string): Promise<void> {
    const result = await this.#lane.cancelQueued(entryId, BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
  }

  /**
   * Answers the last user message again. The transcript's tip moves back to just before it, so
   * the answer that is being replaced leaves the conversation's path rather than being appended to.
   */
  async regenerate(): Promise<boolean> {
    const users = userEntries(await tipPathOf(this.#session))
    const last = users.at(-1)
    if (last === undefined) return false
    const text = last.type === 'message' && last.message.role === 'user' ? textOfContent(last.message.content) : ''
    if (text === '') return false

    const before = await this.#navigateBefore(last.id)
    if (!before) return false
    await this.#lane.prompt(text, undefined, BACKGROUND_CONTEXT)
    return true
  }

  /**
   * Replaces an earlier user message. `truncate` continues this conversation from the edit;
   * `fork` is the manager's job, because it needs a conversation of its own.
   */
  async resend(userMessageIndex: number, text: string): Promise<boolean> {
    const entry = await this.#userEntry(userMessageIndex)
    if (entry === undefined) return false
    if (!(await this.#navigateBefore(entry.id))) return false
    await this.#lane.prompt(text, undefined, BACKGROUND_CONTEXT)
    return true
  }

  /** The id of the nth user message, so the manager can fork at it. */
  async userEntryId(userMessageIndex: number): Promise<Undef<string>> {
    const entry = await this.#userEntry(userMessageIndex)
    return entry?.id
  }

  async sessionMetadata(): Promise<JsonlSessionMetadata> {
    return this.#session.metadata
  }

  /** What the session has spent so far, which is what a window opening it has to show. */
  async usage(): Promise<UsageTotals> {
    return this.#reader.usage()
  }

  /** Moves the tip to the entry before the given one, or to the root when it is the first. */
  async #navigateBefore(entryId: string): Promise<boolean> {
    const ordered = await tipPathOf(this.#session)
    const index = ordered.findIndex((entry) => entry.id === entryId)
    if (index === -1) return false
    const target = index === 0 ? null : ordered[index - 1].id
    const result = await this.#lane.navigateTree(target, undefined, BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
    return result.ok
  }

  async #userEntry(index: number): Promise<Undef<Entry>> {
    const users = userEntries(await tipPathOf(this.#session))
    return users[index]
  }

  /**
   * Stops a run that is still in flight before closing. Closing under one leaves the operation
   * unsettled and the promise that was driving it rejected, which is a crash in miniature — and
   * the conversation it belongs to could not be edited afterwards.
   */
  async close(): Promise<void> {
    if (this.#running) await this.abort()
    await this.#harness.close(BACKGROUND_CONTEXT)
  }

  /** Switches the model this conversation runs on; takes effect on the next turn. */
  async setModel(model: Model<Api>): Promise<void> {
    await this.#lane.setModel({ provider: model.provider, modelId: model.id }, BACKGROUND_CONTEXT)
  }

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.#lane.setThinkingLevel(level, BACKGROUND_CONTEXT)
  }

  /**
   * The conversation as it stands on disk, for a window that just opened it. It is the path from
   * the branch tip, not the whole log: answering a message again moves the tip, and the answers it
   * left behind are then history rather than transcript.
   */
  async transcript(): Promise<ChatMessage[]> {
    return this.#reader.transcript()
  }

  #emitFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.#emit({ conversationId: this.#session.metadata.id, type: 'run_failed', message })
  }
}

/** The user's own messages, in order: what a resend or a fork works from. */
const userEntries = (entries: Entry[]): Entry[] =>
  entries.filter((entry) => entry.type === 'message' && entry.message.role === 'user')

/** The summary a compaction wrote, read from the entry it was written to. */
async function compactionSummary(
  session: Session<JsonlSessionMetadata>,
  entryId: string,
): Promise<{ summary: string; replaced: Undef<number> }> {
  const entry = await session.getEntry(entryId, BACKGROUND_CONTEXT)
  if (entry === undefined) return { summary: '', replaced: undefined }
  if (entry.type === 'compaction') return { summary: entry.summary, replaced: undefined }
  if (entry.type === 'branch_summary') return { summary: entry.summary, replaced: undefined }
  return { summary: '', replaced: undefined }
}
