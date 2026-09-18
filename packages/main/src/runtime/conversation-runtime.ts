/**
 * One conversation, running. Owns the lane, the session and the workspace-scoped execution
 * environment, translates harness events into runtime events, and reports the failures the
 * harness returns as values rather than throws (ADR-0001).
 */

import type { ChatMessage, RuntimeEvent } from '@alpha/core'
import {
  AgentHarness,
  type AgentHarnessTool,
  type AgentLane,
  BACKGROUND_CONTEXT,
  type HarnessEventType,
  type JsonlSessionMetadata,
  JsonlSessionRepo,
  type Session,
  type ThinkingLevel,
} from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import type { Api, Model } from '@earendil-works/pi-ai'
import type { ModelRuntime } from './models.ts'
import { createWorkspaceTools, workspaceToolNames } from './tools.ts'
import { entriesToMessages } from './transcript-entries.ts'
import { createEventTranslator } from './translate.ts'

export interface OpenConversationOptions {
  /** Absent when the conversation is new; the session mints the id and it is adopted. */
  conversationId?: string
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
  'run_end',
  'fault',
]

export class ConversationRuntime {
  readonly #harness: AgentHarness<object>
  readonly #lane: AgentLane
  readonly #session: Session<JsonlSessionMetadata>
  readonly #emit: (event: RuntimeEvent) => void

  private constructor(
    harness: AgentHarness<object>,
    lane: AgentLane,
    session: Session<JsonlSessionMetadata>,
    emit: (event: RuntimeEvent) => void,
  ) {
    this.#harness = harness
    this.#lane = lane
    this.#session = session
    this.#emit = emit
  }

  static async open(options: OpenConversationOptions): Promise<OpenedRuntime> {
    const env = new NodeExecutionEnv({ cwd: options.workspacePath })
    const repo = new JsonlSessionRepo({ fileSystem: env, sessionsRoot: options.sessionsRoot })
    const session =
      options.sessionMetadata === undefined
        ? await repo.create({ cwd: options.workspacePath }, BACKGROUND_CONTEXT)
        : await repo.open(options.sessionMetadata, BACKGROUND_CONTEXT)

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
    const runtime = new ConversationRuntime(harness, lane, session, options.emit)
    const translator = createEventTranslator(conversationId)
    for (const type of SUBSCRIBED_EVENTS) {
      harness.events.on(type, (event) => {
        for (const translated of translator.translate(event)) runtime.#emit(translated)
      })
    }

    const entries = await session.findEntries(undefined, BACKGROUND_CONTEXT)
    return { runtime, conversationId, messages: entriesToMessages(entries) }
  }

  async prompt(text: string): Promise<void> {
    const result = await this.#lane.prompt(text, undefined, BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
  }

  async abort(): Promise<void> {
    const result = await this.#lane.abort(BACKGROUND_CONTEXT)
    if (!result.ok) this.#emitFailure(result.error)
  }

  async close(): Promise<void> {
    await this.#harness.close(BACKGROUND_CONTEXT)
  }

  /** Switches the model this conversation runs on; takes effect on the next turn. */
  async setModel(model: Model<Api>): Promise<void> {
    await this.#lane.setModel({ provider: model.provider, modelId: model.id }, BACKGROUND_CONTEXT)
  }

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.#lane.setThinkingLevel(level, BACKGROUND_CONTEXT)
  }

  /** The conversation as it stands on disk, for a window that just opened it. */
  async transcript(): Promise<ChatMessage[]> {
    return entriesToMessages(await this.#session.findEntries(undefined, BACKGROUND_CONTEXT))
  }

  #emitFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.#emit({ conversationId: this.#session.metadata.id, type: 'run_failed', message })
  }
}

/** The transcript of a conversation that is not open, read straight from its session. */
export async function readTranscript(options: {
  sessionsRoot: string
  workspacePath: string
  conversationId: string
}): Promise<ChatMessage[]> {
  if (options.conversationId === '') return []
  const metadata = await findSessionMetadata(options)
  if (metadata === undefined) return []
  const repo = new JsonlSessionRepo({
    fileSystem: new NodeExecutionEnv({ cwd: options.workspacePath }),
    sessionsRoot: options.sessionsRoot,
  })
  const session = await repo.open(metadata, BACKGROUND_CONTEXT)
  const messages = entriesToMessages(await session.findEntries(undefined, BACKGROUND_CONTEXT))
  await session.close(BACKGROUND_CONTEXT)
  return messages
}

/** Finds the session a conversation is stored in, so it can be reopened after a restart. */
export async function findSessionMetadata(options: {
  sessionsRoot: string
  workspacePath: string
  conversationId: string
}): Promise<JsonlSessionMetadata | undefined> {
  const repo = new JsonlSessionRepo({
    fileSystem: new NodeExecutionEnv({ cwd: options.sessionsRoot }),
    sessionsRoot: options.sessionsRoot,
  })
  const sessions = await repo.list({ cwd: options.workspacePath }, BACKGROUND_CONTEXT)
  return sessions.find((metadata) => metadata.id === options.conversationId)
}
