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
 * Nothing here throws at a caller for a failure that is a value: a run that fails and a model that
 * is missing are both reported as the window's own `run_failed`, because a conversation that
 * cannot run is a conversation that says why rather than one that crashes.
 */

import type { AlphaPlugin } from '@alpha/agent'
import { historyOf, RUN_FAILED, runAfterRunHooks } from '@alpha/agent'
import {
  type ApprovalRecord,
  type Attachment,
  imagesOf,
  listOf,
  type RuntimeEvent,
  recordOf,
  type ThinkingLevel,
  type Undef,
  userBlocksOf,
} from '@alpha/domain'
import type { RetryDecider } from '@alpha/plugin'
import { type NewEntry, type SessionStore, tipPath } from '@alpha/sessions'
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
  /** Asks the compaction plugin to run now, threshold aside; answered whether it did. */
  compact?: () => Promise<boolean>
  /** The retry policy, whose decision keeps the turn open across a retry it has planned. */
  retry?: RetryDecider
  emit: (event: RuntimeEvent) => void
}

export class ConversationRuntime {
  private readonly conversationId: string
  private readonly models: Models
  private readonly store: SessionStore
  private readonly plugins: AlphaPlugin[]
  private readonly compactor: Undef<() => Promise<boolean>>
  private readonly emit: (event: RuntimeEvent) => void
  private readonly translator: AgentEventTranslator
  private agent: Undef<Agent>
  private sessionId: string
  private readonly workspacePath: string
  private inFlight: Undef<Promise<void>>
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
    this.compactor = options.compact
    this.emit = options.emit
    this.sessionId = options.session.id
    this.workspacePath = options.session.workspacePath
    this.translator = new AgentEventTranslator(options.conversationId, options.retry)
    options.agent?.subscribe((event) => this.onEvent(event))
  }

  /** Announces the message in the session first, then starts the run behind it. */
  public async prompt(text: string, attachments?: Attachment[]): Promise<void> {
    const agent = this.agent
    if (agent === undefined) {
      this.failed('No model is configured for this conversation, so it cannot run.')
      return
    }
    // One run at a time: the agent refuses to overlap them, so a prompt sent while the last one is
    // still settling waits for it, and then runs.
    await this.driving
    const images = imagesOf(attachments) ?? []
    const entry = this.append({
      type: 'message',
      message: { role: 'user', content: [{ type: 'text', text }, ...images], timestamp: Date.now() },
    })
    this.emit({
      conversationId: this.conversationId,
      type: 'user_message',
      message: {
        id: entry.id,
        role: 'user',
        blocks: userBlocksOf([{ type: 'text', text }, ...images]),
        createdAt: Date.now(),
        status: 'complete',
      },
    })
    this.inFlight = agent.prompt(text, images)
    this.driving = this.drive()
  }

  /** A message for the run in flight: it arrives now, and changes what the agent does next. */
  public async steer(text: string): Promise<void> {
    this.agent?.steer(this.userMessage(text))
  }

  /**
   * Emptying what the agent is holding. Its queue is its own and is emptied whole, which is why the
   * workbench keeps its own list for messages that are waiting for a turn: those are Alpha's, and
   * they are taken back one at a time there.
   */
  public async cancelQueued(): Promise<void> {
    this.agent?.clearAllQueues()
  }

  /** Stops the run in flight: the agent keeps the message it was writing, marked interrupted. */
  public async abort(): Promise<void> {
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
  public async settle(): Promise<void> {
    await this.driving
  }

  /** Switches the model this conversation runs on; takes effect on the next turn. */
  public async setModel(providerId: string, modelId: string): Promise<void> {
    const agent = this.agent
    const model = this.models.getModel(providerId, modelId)
    if (agent === undefined || model === undefined) {
      this.failed(`Alpha has no model ${modelId} on ${providerId} to run this conversation on.`)
      return
    }
    agent.state.model = model
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
    if (this.driving === undefined) return
    this.agent?.abort()
    await this.settle()
  }

  /** The run's other half: wait it out, then let the plugins see how it went. A failure is news. */
  private async drive(): Promise<void> {
    const agent = this.agent
    if (agent === undefined) return
    try {
      await this.inFlight
      await runAfterRunHooks(agent, this.plugins)
    } catch (error) {
      // A throw with nothing to say is the same failure as a message with nothing to say.
      this.failed(error instanceof Error ? error.message : RUN_FAILED)
    } finally {
      // The run is over, however it went: the next prompt starts a run of its own.
      this.driving = undefined
    }
  }

  /** Every agent event: persisted as it arrived, then translated for the window. */
  private onEvent(event: AgentEvent): void {
    this.persist(event)
    for (const translated of this.translator.translate(event)) this.emit(translated)
  }

  /** What the run produced, written to the session the moment it exists — the store is the record. */
  private persist(event: AgentEvent): void {
    if (event.type === 'message_end' && recordOf(event.message).role === 'assistant') {
      this.append({ type: 'message', message: event.message })
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

  private failed(message: string): void {
    this.emit({ conversationId: this.conversationId, type: 'run_failed', message })
  }
}
