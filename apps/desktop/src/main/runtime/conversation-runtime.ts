/**
 * One conversation, running: the embedded agent (ADR-0025) and this file, which drives it and
 * turns what it says into what the window draws.
 *
 * The agent owns the run and its tools; a prompt is a method call and an event subscription, with
 * no child to keep alive. Alpha owns the transcript of record: every message the run produces is
 * written to the session store the moment it exists, and every question about what was said — the
 * transcript, the usage, the user's own messages — is answered by the store, which is why a
 * reopened conversation is the conversation.
 *
 * Nothing here throws at a caller for a failure that is a value: a run that fails and a model that
 * is missing are both reported as the window's own `run_failed`, because a conversation that
 * cannot run is a conversation that says why rather than one that crashes.
 */

import {
  type ApprovalRecord,
  type Attachment,
  type ChatMessage,
  imagesOf,
  listOf,
  type RuntimeEvent,
  recordOf,
  type ThinkingLevel,
  type Undef,
  type UsageTotals,
  userBlocksOf,
} from '@alpha/core'
import type { Agent, AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { Models } from '@earendil-works/pi-ai'
import { runAfterRunHooks } from './after-run.ts'
import { contextOf } from './agent-context.ts'
import { AgentEventTranslator } from './agent-events.ts'
import type { DecisionLookup } from './decisions.ts'
import type { AlphaPlugin, RetryDecider } from './plugin-contract.ts'
import type { NewEntry, SessionStore } from './sessions.ts'
import { tipPath } from './sessions.ts'
import type { AgentEntry } from './transcript-entries.ts'

/** The retry policy's pure decision, kept with the other plugin faces in plugin-contract. */
export type { RetryDecider } from './plugin-contract.ts'

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
  /** How earlier calls got past the gate, for the rows in a rendered transcript (decisions.ts). */
  decisions?: DecisionLookup
  emit: (event: RuntimeEvent) => void
}

export class ConversationRuntime {
  readonly #conversationId: string
  readonly #models: Models
  readonly #store: SessionStore
  readonly #plugins: AlphaPlugin[]
  readonly #compact: Undef<() => Promise<boolean>>
  readonly #decisions: Undef<DecisionLookup>
  readonly #emit: (event: RuntimeEvent) => void
  readonly #translator: AgentEventTranslator
  #agent: Undef<Agent>
  #sessionId: string
  readonly #workspacePath: string
  #inFlight: Undef<Promise<void>>
  /**
   * The whole of the run now ending — retries included — so the next one starts after it. This is
   * the one answer to "is a run in flight": assigned when a prompt is asked for, gone when the
   * run's last half (the plugins' afterRun loop) has finished.
   */
  #driving: Undef<Promise<void>>
  /** The message announced as held for the running turn, until the agent takes it into the run. */
  #held: Undef<string>

  constructor(options: ConversationRuntimeOptions) {
    this.#conversationId = options.conversationId
    this.#agent = options.agent
    this.#models = options.models
    this.#store = options.store
    this.#plugins = options.plugins
    this.#compact = options.compact
    this.#decisions = options.decisions
    this.#emit = options.emit
    this.#sessionId = options.session.id
    this.#workspacePath = options.session.workspacePath
    this.#translator = new AgentEventTranslator(options.conversationId, options.retry)
    options.agent?.subscribe((event) => this.#onEvent(event))
  }

  /** Announces the message in the session first, then starts the run behind it. */
  async prompt(text: string, attachments?: Attachment[]): Promise<void> {
    const agent = this.#agent
    if (agent === undefined) {
      this.#failed('No model is configured for this conversation, so it cannot run.')
      return
    }
    // One run at a time: the agent refuses to overlap them, so a prompt sent while the last one is
    // still settling waits for it, and then runs.
    await this.#driving
    const images = imagesOf(attachments) ?? []
    const entry = this.#append({
      type: 'message',
      message: { role: 'user', content: [{ type: 'text', text }, ...images], timestamp: Date.now() },
    })
    this.#emit({
      conversationId: this.#conversationId,
      type: 'user_message',
      message: {
        id: entry.id,
        role: 'user',
        blocks: userBlocksOf([{ type: 'text', text }, ...images]),
        createdAt: Date.now(),
        status: 'complete',
      },
    })
    this.#inFlight = agent.prompt(text, images)
    this.#driving = this.#drive()
  }

  /** A message for the run in flight: it arrives now, and changes what the agent does next. */
  async steer(text: string): Promise<void> {
    this.#agent?.steer(this.#userMessage(text))
    this.#held = text
    this.#emit(this.#queued(text))
  }

  /** A message for after this run: the agent holds it and takes it up when the run is done. */
  async followUp(text: string): Promise<void> {
    this.#agent?.followUp(this.#userMessage(text))
    this.#emit(this.#queued(text))
  }

  /**
   * Emptying what the agent is holding. Its queue is its own and is emptied whole, which is why the
   * workbench keeps its own list for messages that are waiting for a turn: those are Alpha's, and
   * they are taken back one at a time there.
   */
  async cancelQueued(): Promise<void> {
    this.#agent?.clearAllQueues()
    this.#emit({ conversationId: this.#conversationId, type: 'queue_updated', queued: [], paused: false })
  }

  /** Stops the run in flight: the agent keeps the message it was writing, marked interrupted. */
  async abort(): Promise<void> {
    this.#agent?.abort()
  }

  /**
   * Compacting by hand (ADR-0025): the compaction plugin's one path, threshold aside. The answer
   * says whether a compaction happened — nothing to summarize is no, not an error.
   */
  async compact(): Promise<boolean> {
    if (this.#compact === undefined) return false
    return this.#compact()
  }

  /**
   * How a gated call got past, announced the moment the gate has decided. The row is already on
   * screen — the agent announced the call before it asked — so the decision lands on it here.
   */
  decided(callId: string, approval: ApprovalRecord): void {
    this.#emit({ conversationId: this.#conversationId, type: 'tool_decided', callId, approval })
  }

  /**
   * Whether a run is in flight. It starts false for every runtime, so a run is in flight exactly
   * when this process is running it: a turn that was cut off by a closed window is over.
   */
  isRunning(): boolean {
    return this.#driving !== undefined
  }

  /**
   * Waits for the run this runtime asked for to end. Whoever asked for one and then needs the whole
   * of it — a regenerate, which hands the window the transcript the new answer is on — waits here
   * rather than guessing. The run's other half, the plugins' afterRun loop, is part of the promise
   * waited on.
   */
  async settle(): Promise<void> {
    await this.#driving
  }

  /** The conversation as it stands, read from the store: what a window just opening it draws. */
  async transcript(): Promise<ChatMessage[]> {
    return this.#store.transcript(this.#sessionId, this.#workspacePath, this.#decisions)
  }

  /** What the session has spent so far, which is what a window opening it has to show. */
  async usage(): Promise<UsageTotals> {
    return this.#store.usage(this.#sessionId, this.#workspacePath)
  }

  /** The user's own messages, in order: what a resend or a fork works from. */
  async userEntries(): Promise<AgentEntry[]> {
    return this.#store.userEntries(this.#sessionId, this.#workspacePath)
  }

  /** Switches the model this conversation runs on; takes effect on the next turn. */
  async setModel(providerId: string, modelId: string): Promise<void> {
    const agent = this.#agent
    const model = this.#models.getModel(providerId, modelId)
    if (agent === undefined || model === undefined) {
      this.#failed(`Alpha has no model ${modelId} on ${providerId} to run this conversation on.`)
      return
    }
    agent.state.model = model
  }

  /**
   * Alpha's ladder and pi's are the same words, 'off' included: the agent reads 'off' as no
   * reasoning at all, so the level crosses as it is.
   */
  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    if (this.#agent !== undefined) this.#agent.state.thinkingLevel = level
  }

  /**
   * Moves this conversation back to before an entry: the store forks the session there and this
   * runtime carries on in the copy — its id from now on, its history in the agent. The id of the
   * copy is what the conversation has to record.
   */
  async forkAt(entryId: string): Promise<Undef<string>> {
    const forked = this.#store.fork(this.#sessionId, this.#workspacePath, entryId)
    if (forked === undefined) return undefined
    this.#sessionId = forked
    const agent = this.#agent
    if (agent !== undefined) {
      agent.sessionId = forked
      this.#reload(agent)
    }
    return forked
  }

  /**
   * Stops a run that is still in flight before closing: an abandoned run would keep writing into a
   * session nobody is driving (ADR-0008). There is nothing to reap — no child was ever started.
   */
  async close(): Promise<void> {
    if (this.#driving === undefined) return
    this.#agent?.abort()
    await this.settle()
  }

  /** The run's other half: wait it out, then let the plugins see how it went. A failure is news. */
  async #drive(): Promise<void> {
    const agent = this.#agent
    if (agent === undefined) return
    try {
      await this.#inFlight
      await runAfterRunHooks(agent, this.#plugins)
    } catch (error) {
      this.#failed(error instanceof Error ? error.message : 'The run failed.')
    } finally {
      // The run is over, however it went: the next prompt starts a run of its own.
      this.#driving = undefined
    }
  }

  /** Every agent event: persisted as it arrived, then translated for the window. */
  #onEvent(event: AgentEvent): void {
    this.#persist(event)
    for (const translated of this.#translator.translate(event)) this.#note(translated)
  }

  /** What the run produced, written to the session the moment it exists — the store is the record. */
  #persist(event: AgentEvent): void {
    if (event.type === 'message_end' && recordOf(event.message).role === 'assistant') {
      this.#append({ type: 'message', message: event.message })
    }
    if (event.type === 'tool_execution_end') {
      const result = recordOf(event.result)
      this.#append({
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

  #append(entry: NewEntry): ReturnType<SessionStore['append']> {
    return this.#store.append({ sessionId: this.#sessionId, workspacePath: this.#workspacePath, entry })
  }

  /** The agent continues from the copy: its context becomes the copy's history. */
  #reload(agent: Agent): void {
    const read = this.#store.entries(this.#sessionId, this.#workspacePath)
    const system = agent.state.messages.find((message) => message.role === 'system')
    const history = contextOf(tipPath(read.entries, read.leafId))
    agent.state.messages = system === undefined ? history : [system, ...history]
  }

  #userMessage(text: string): AgentMessage {
    return { role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }
  }

  #queued(text: string): RuntimeEvent {
    return {
      conversationId: this.#conversationId,
      type: 'queue_updated',
      queued: [{ entryId: crypto.randomUUID(), text, kind: 'steer' }],
      paused: false,
    }
  }

  #note(event: RuntimeEvent): void {
    if (event.type === 'user_message') this.#steerTaken(event)
    if (event.type === 'turn_finished' || event.type === 'run_failed') this.#endRun()
    this.#emit(event)
  }

  /**
   * The run is over, however it went. Nothing is held for a turn that is over, so a steer that
   * never reached the conversation stops being announced as held.
   */
  #endRun(): void {
    if (this.#held !== undefined) {
      this.#held = undefined
      this.#emit({ conversationId: this.#conversationId, type: 'queue_updated', queued: [], paused: false })
    }
  }

  /**
   * A held message is held only until the agent puts it in the conversation it is running — the
   * moment its own words land as a message of the transcript, it is being answered, not held, and
   * the strip that shows what waits says so.
   */
  #steerTaken(event: Extract<RuntimeEvent, { type: 'user_message' }>): void {
    const held = this.#held
    if (held === undefined) return
    const said = event.message.blocks
      .filter((block) => block.kind === 'text')
      .map((block) => block.text)
      .join('')
    if (!said.includes(held)) return
    this.#held = undefined
    this.#emit({ conversationId: this.#conversationId, type: 'queue_updated', queued: [], paused: false })
  }

  #failed(message: string): void {
    this.#emit({ conversationId: this.#conversationId, type: 'run_failed', message })
  }
}
