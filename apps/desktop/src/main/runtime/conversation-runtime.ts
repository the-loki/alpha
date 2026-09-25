/**
 * One conversation, running: the embedded agent (ADR-0025) and this file, which drives it and
 * turns what it says into what the window draws.
 *
 * The agent owns the run and its tools; a prompt is a method call and an event subscription, with
 * no child to keep alive. Alpha owns the transcript of record: every message the run produces is
 * written to the session store the moment it exists, which is why a reopened conversation is the
 * conversation. What was said is read back by `ConversationReads`, addressed by the conversation —
 * this file writes and runs, and answers no questions about the record.
 *
 * Nothing here throws at a caller for a failure that is a value: a run that fails is reported as
 * the window's own `run_failed`, and a turn that cannot start as a `turn_refused` carrying the case
 * — because a conversation that cannot run is a conversation that says why rather than one that
 * crashes, and the words for the case belong to the window (ADR-0010).
 */

import type { AlphaPlugin, PluginHost } from '@alpha/agent'
import { historyOf, runAfterRunHooks } from '@alpha/agent'
import {
  type ApprovalRecord,
  type Attachment,
  imagesOf,
  listOf,
  type RuntimeEvent,
  recordOf,
  type ThinkingLevel,
  type TurnRefusal,
  type Undef,
  type UsageTotals,
} from '@alpha/domain'
import type { RetryDecider } from '@alpha/plugin'
import { type NewEntry, type SessionStore, tipPath, type WorkspaceChangeLog } from '@alpha/sessions'
import type { Agent, AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { Models } from '@earendil-works/pi-ai'
import { AgentEventTranslator } from './agent-events.ts'

/** What one conversation is built from: the assembled agent, its session, and the store behind it. */
export interface ConversationRuntimeOptions {
  /** Alpha's own id for the conversation, which is also the first session's id. */
  conversationId: string
  /** The assembled agent, or nothing when no model is configured: then nothing can run. */
  agent: Undef<Agent>
  /** The model runtime the agent dials with, and where setModel finds its models. */
  models: Models
  /** The session this conversation is on, and where the session's workspace is. */
  session: { id: string; workspacePath: string }
  store: SessionStore
  plugins: AlphaPlugin[]
  host?: PluginHost
  /** Asks the compaction plugin to run now, threshold aside; answered whether it did. */
  compact?: () => Promise<boolean>
  /** The retry policy, whose decision keeps the turn open across a retry it has planned. */
  retry?: RetryDecider
  changes?: WorkspaceChangeLog
  emit: (event: RuntimeEvent) => void
}

export class ConversationRuntime {
  private readonly conversationId: string
  private readonly models: Models
  private readonly store: SessionStore
  private readonly plugins: AlphaPlugin[]
  private readonly host: Undef<PluginHost>
  private readonly unsubscribe: Undef<() => void>
  private readonly compactor: Undef<() => Promise<boolean>>
  private readonly emit: (event: RuntimeEvent) => void
  private readonly translator: AgentEventTranslator
  private readonly changes: Undef<WorkspaceChangeLog>
  private agent: Undef<Agent>
  private sessionId: string
  private readonly workspacePath: string
  private inFlight: Undef<Promise<void>>
  private runAbort: Undef<AbortController>
  private lastRunSucceeded = false
  private pendingFinish = false
  private captureActive = false
  private lastFailedEntryId: Undef<string>
  private lastFailedMessageId: Undef<string>
  /**
   * The whole of the run now ending — retries included — so the next one starts after it. This is
   * the one answer to "is a run in flight": assigned when a prompt is asked for, gone when the
   * run's last half (the plugins' afterRun loop) has finished.
   */
  private driving: Undef<Promise<void>>

  public constructor(options: ConversationRuntimeOptions) {
    this.conversationId = options.conversationId
    this.agent = options.agent
    this.models = options.models
    this.store = options.store
    this.plugins = options.plugins
    this.host = options.host
    this.compactor = options.compact
    this.emit = options.emit
    this.sessionId = options.session.id
    this.workspacePath = options.session.workspacePath
    this.translator = new AgentEventTranslator(options.conversationId, options.retry)
    this.changes = options.changes
    this.unsubscribe = options.agent?.subscribe((event) => this.onEvent(event))
  }

  /**
   * Starts the run behind the message. What the person said is not announced or written here: the
   * run takes it as a message of its own and says so (`message_start`), which is the one moment it
   * exists — the prompt's own message and a steering message arrive through the same door, and the
   * window and the record both come from it.
   *
   * Answers with why the turn did not start when it did not, so a caller never has to read the
   * events to find out whether anything began. The case is said to the conversation as well.
   */
  public async prompt(text: string, attachments?: Attachment[]): Promise<Undef<TurnRefusal>> {
    const agent = this.agent
    if (agent === undefined) {
      this.refuse({ kind: 'no-model' })
      return { kind: 'no-model' }
    }
    // One run at a time: the agent refuses to overlap them, so a prompt sent while the last one is
    // still settling waits for it, and then runs.
    while (this.driving !== undefined) await this.driving
    this.lastRunSucceeded = false
    this.pendingFinish = false
    this.lastFailedEntryId = undefined
    this.lastFailedMessageId = undefined
    this.runAbort = new AbortController()
    const images = imagesOf(attachments) ?? []
    this.beginWorkspaceReview()
    try {
      this.inFlight = agent.prompt(text, images)
    } catch (error) {
      this.inFlight = Promise.reject(error)
    }
    this.driving = this.drive()
    return undefined
  }

  /** A message for the run in flight: it arrives now, and changes what the agent does next. */
  public async steer(text: string): Promise<void> {
    this.agent?.steer(this.userMessage(text))
  }

  /** Pi clears steering as a group; Alpha restores the steers that were not cancelled. */
  public replaceSteers(texts: readonly string[]): void {
    const agent = this.agent
    if (agent === undefined) return
    agent.clearSteeringQueue()
    for (const text of texts) agent.steer(this.userMessage(text))
  }

  /** Stops the run in flight: the agent keeps the message it was writing, marked interrupted. */
  public async abort(): Promise<void> {
    this.runAbort?.abort()
    this.agent?.abort()
  }

  /**
   * Compacting by hand (ADR-0025): the compaction plugin's one path, threshold aside. The answer
   * says whether a compaction happened — nothing to summarize is no, not an error.
   */
  public async compact(): Promise<boolean> {
    if (this.compactor === undefined) return false
    return this.compactor()
  }

  /**
   * How a gated call got past, announced the moment the gate has decided. The row is already on
   * screen — the agent announced the call before it asked — so the decision lands on it here.
   */
  public decided(callId: string, approval: ApprovalRecord): void {
    this.emit({ conversationId: this.conversationId, type: 'tool_decided', callId, approval })
  }

  /** The child's messages stay private; its model usage belongs to this conversation's bill. */
  public recordSubagentUsage(usage: UsageTotals): void {
    if (usage.totalTokens === 0 && usage.cost === 0) return
    this.append({ type: 'subagent_usage', usage })
    this.emit({ conversationId: this.conversationId, type: 'usage_recorded', usage })
  }

  /**
   * Whether a run is in flight. It starts false for every runtime, so a run is in flight exactly
   * when this process is running it: a turn that was cut off by a closed window is over.
   */
  public isRunning(): boolean {
    return this.driving !== undefined
  }

  /**
   * Waits for the run this runtime asked for to end. Whoever asked for one and then needs the whole
   * of it — a regenerate, which hands the window the transcript the new answer is on — waits here
   * rather than guessing. The run's other half, the plugins' afterRun loop, is part of the promise
   * waited on.
   */
  public async settle(): Promise<boolean> {
    await this.driving
    return this.lastRunSucceeded
  }

  /** Switches the model this conversation runs on; takes effect on the next turn. */
  public async setModel(providerId: string, modelId: string): Promise<boolean> {
    const agent = this.agent
    if (agent === undefined) {
      this.refuse({ kind: 'no-model' })
      return false
    }
    const model = this.models.getModel(providerId, modelId)
    if (model === undefined) {
      this.refuse({ kind: 'model-not-served', providerId, modelId })
      return false
    }
    agent.state.model = model
    return true
  }

  /**
   * Alpha's ladder and pi's are the same words, 'off' included: the agent reads 'off' as no
   * reasoning at all, so the level crosses as it is.
   */
  public async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    if (this.agent !== undefined) this.agent.state.thinkingLevel = level
  }

  /**
   * Moves this conversation back to before an entry: the store forks the session there and this
   * runtime carries on in the copy — its id from now on, its history in the agent. The id of the
   * copy is what the conversation has to record.
   */
  public async forkAt(entryId: string): Promise<Undef<string>> {
    const forked = this.store.fork(this.sessionId, this.workspacePath, entryId)
    if (forked === undefined) return undefined
    this.sessionId = forked
    const agent = this.agent
    if (agent !== undefined) {
      agent.sessionId = forked
      this.reload(agent)
    }
    return forked
  }

  /**
   * Stops a run that is still in flight before closing: an abandoned run would keep writing into a
   * session nobody is driving (ADR-0008). There is nothing to reap — no child was ever started.
   */
  public async close(): Promise<void> {
    if (this.driving !== undefined) {
      await this.abort()
      await this.settle()
    }
    this.unsubscribe?.()
    await this.host?.close()
  }

  /** The run's other half: wait it out, then let the plugins see how it went. A failure is news. */
  private async drive(): Promise<void> {
    const agent = this.agent
    if (agent === undefined) return
    const signal = this.runAbort?.signal
    try {
      await this.inFlight
      const outcome = await runAfterRunHooks(agent, this.plugins, () => this.branchPastFailedAttempt(), signal)
      this.lastRunSucceeded = outcome.failed === undefined && !outcome.aborted
    } catch (error) {
      this.pendingFinish = false
      // A throw's own words are quoted as they came, and a throw with nothing to say is the same
      // failure as a message with nothing to say: the sentence for that case is the window's, in
      // the language the window is in (ADR-0010), so nothing is invented here for it.
      if (!signal?.aborted) this.failed(error instanceof Error && error.message !== '' ? error.message : undefined)
    } finally {
      if (
        signal?.aborted &&
        this.translator.translate({ type: 'agent_settled' }).some((event) => event.type === 'turn_finished')
      )
        this.pendingFinish = true
      this.finishWorkspaceReview()
      if (this.pendingFinish) this.emit({ conversationId: this.conversationId, type: 'turn_finished' })
      this.pendingFinish = false
      // The run is over, however it went: the next prompt starts a run of its own.
      this.runAbort = undefined
      this.driving = undefined
    }
  }

  private beginWorkspaceReview(): void {
    if (this.changes === undefined) return
    try {
      this.changes.begin(this.conversationId, this.workspacePath, Date.now())
      this.captureActive = true
    } catch (error) {
      console.warn('Workspace review could not start', error)
    }
  }

  private finishWorkspaceReview(): void {
    if (!this.captureActive) return
    this.captureActive = false
    try {
      const changeSet = this.changes?.finish(this.conversationId, Date.now())
      if (changeSet !== undefined)
        this.emit({ conversationId: this.conversationId, type: 'workspace_changes_recorded', changeSet })
    } catch (error) {
      console.warn('Workspace review could not finish', error)
    }
  }

  /** Every agent event: persisted as it arrived, then translated for the window. */
  private onEvent(event: AgentEvent): void {
    this.persist(event)
    const ending =
      event.type === 'agent_end' && this.runAbort?.signal.aborted ? ({ type: 'agent_settled' } as const) : event
    for (const translated of this.translator.translate(ending)) {
      if (
        event.type === 'message_end' &&
        recordOf(event.message).stopReason === 'error' &&
        translated.type === 'assistant_message_finished'
      ) {
        this.lastFailedMessageId = translated.messageId
      }
      if (translated.type === 'turn_finished') {
        this.pendingFinish = true
        continue
      }
      this.emit(translated)
    }
  }

  /**
   * What the run produced, written to the session the moment it exists — the store is the record.
   * A message the person sent is one of them: the run takes the prompt's message and any steering
   * message as messages of its own, so this is where both are written, and steering is recorded
   * without this file having a second rule for it.
   */
  private persist(event: AgentEvent): void {
    if (event.type === 'message_end') {
      const role = recordOf(event.message).role
      if (role === 'user' || role === 'assistant') {
        const entry = this.append({ type: 'message', message: event.message })
        if (role === 'assistant' && recordOf(event.message).stopReason === 'error') this.lastFailedEntryId = entry.id
      }
    }
    if (event.type === 'tool_execution_end') {
      const result = recordOf(event.result)
      this.append({
        type: 'message',
        message: {
          role: 'toolResult',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          content: listOf(result.content),
          isError: event.isError === true,
          ...(result.details === undefined ? {} : { details: result.details }),
          timestamp: Date.now(),
        },
      })
    }
  }

  private append(entry: NewEntry): ReturnType<SessionStore['append']> {
    return this.store.append({ sessionId: this.sessionId, workspacePath: this.workspacePath, entry })
  }

  private branchPastFailedAttempt(): void {
    const entryId = this.lastFailedEntryId
    if (entryId === undefined) return
    if (this.store.branchBefore(this.sessionId, this.workspacePath, entryId) === undefined) {
      throw new Error('Failed retry entry is missing from the session path')
    }
    if (this.lastFailedMessageId !== undefined) {
      this.emit({
        conversationId: this.conversationId,
        type: 'assistant_message_discarded',
        messageId: this.lastFailedMessageId,
      })
    }
    this.lastFailedEntryId = undefined
    this.lastFailedMessageId = undefined
  }

  /** The agent continues from the copy: its context becomes the copy's history. */
  private reload(agent: Agent): void {
    const read = this.store.entries(this.sessionId, this.workspacePath)
    const system = agent.state.messages.find((message) => message.role === 'system')
    const history = historyOf(tipPath(read.entries, read.leafId))
    agent.state.messages = system === undefined ? history : [system, ...history]
  }

  private userMessage(text: string): AgentMessage {
    return { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }
  }

  /** A failure this file reports itself, with the words it has: a refusal says why it refused. */
  private failed(message: Undef<string>): void {
    this.emit({
      conversationId: this.conversationId,
      type: 'run_failed',
      ...(message === undefined ? {} : { message }),
    })
  }

  /**
   * A turn this conversation will not start, and which refusal stopped it. The case is the whole of
   * it: the words for it are the window's, in the window's language (ADR-0010), because a sentence
   * written here would arrive in English whatever language the window is in.
   */
  private refuse(refusal: TurnRefusal): void {
    this.emit({ conversationId: this.conversationId, type: 'turn_refused', refusal })
  }
}
