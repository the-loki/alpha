/**
 * One conversation, running: the child process that is the agent, and this file, which asks it for
 * things and turns what it says into what the window draws.
 *
 * The agent owns the run, the session and the tools. Alpha owns the gate — every call the agent is
 * about to make is put to Alpha's ladder, and a refusal travels back as the tool's result, in
 * Alpha's words — and the transcript the person reads, which is read back off the same pipe.
 *
 * Nothing here throws at a caller for a failure that is a value: a command the agent refused and a
 * child that has died are both reported as the window's own `run_failed`, because a conversation
 * that cannot run is a conversation that says why rather than one that crashes.
 */

import {
  type ApprovalAsk,
  type Attachment,
  type ChatMessage,
  imagesOf,
  type PermissionLevel,
  type PermissionRule,
  type RuntimeEvent,
  type ThinkingLevel,
  type Undef,
  type UsageTotals,
} from '@alpha/core'
import { AgentRpc, type RpcEvent } from '../agent-cli/rpc.ts'
import { AgentEventTranslator } from './agent-events.ts'
import type { AgentProcess } from './agent-process.ts'
import type { DecisionLedger } from './decisions.ts'
import { type ApprovalAnswer, createToolGate, type GatePorts, type GateVerdict, type ToolCallEvent } from './gate.ts'
import { GATE_TITLE } from './gate-extension.ts'
import { SessionReader } from './session-reader.ts'
import type { AgentEntry } from './transcript-entries.ts'

/** How the gate reaches the policy and the person: all four are read at the moment of a call. */
export interface PermissionPorts {
  level: (conversationId: string) => PermissionLevel
  rules: () => PermissionRule[]
  remember: (rule: PermissionRule) => void
  ask: (conversationId: string, ask: ApprovalAsk) => Promise<ApprovalAnswer>
}

export interface OpenConversationOptions {
  /** Alpha's own id for the conversation, which is also the agent's session id. */
  conversationId: string
  /** The command line and environment the agent runs with, in the conversation's workspace. */
  process: AgentProcess
  /** Absent only in tests that want the gate out of the way; every real conversation has one. */
  permissions?: PermissionPorts
  /** How earlier calls got past the gate, and where the next decision is written (decisions.ts). */
  decisions?: DecisionLedger
  emit: (event: RuntimeEvent) => void
}

export interface OpenedRuntime {
  runtime: ConversationRuntime
  conversationId: string
}

type Gate = (event: ToolCallEvent) => Promise<GateVerdict>

export class ConversationRuntime {
  readonly #conversationId: string
  readonly #rpc: AgentRpc
  readonly #reader: SessionReader
  readonly #emit: (event: RuntimeEvent) => void
  readonly #gate: Undef<Gate>
  /** Whether a run is in flight, read from the events the runtime already translates. */
  #running = false
  /** Whether the run that was just asked for has ended yet: what `settle` waits on. */
  #waiting = false
  #settled: Undef<() => void>

  private constructor(
    conversationId: string,
    rpc: AgentRpc,
    reader: SessionReader,
    gate: Undef<Gate>,
    emit: (event: RuntimeEvent) => void,
  ) {
    this.#conversationId = conversationId
    this.#rpc = rpc
    this.#reader = reader
    this.#gate = gate
    this.#emit = emit
  }

  static open(options: OpenConversationOptions): OpenedRuntime {
    const decisions = options.decisions
    const rpc = AgentRpc.open({
      file: options.process.file,
      args: options.process.args,
      cwd: options.process.cwd,
      env: options.process.env,
    })
    const translator = new AgentEventTranslator(options.conversationId)
    const gate = options.permissions === undefined ? undefined : createToolGate(gatePorts(options, decisions))
    const runtime = new ConversationRuntime(
      options.conversationId,
      rpc,
      new SessionReader(rpc, decisions),
      gate,
      options.emit,
    )
    rpc.onEvent((event) => {
      if (event.type === 'extension_ui_request') void runtime.#answerRequest(event)
      for (const translated of translator.translate(event)) runtime.#note(translated)
    })
    rpc.onExit(() => runtime.#died())
    return { runtime, conversationId: options.conversationId }
  }

  async prompt(text: string, attachments?: Attachment[]): Promise<void> {
    this.#waiting = true
    const images = imagesOf(attachments) ?? []
    const outcome = await this.#rpc.send({
      type: 'prompt',
      message: text,
      ...(images.length === 0 ? {} : { images }),
    })
    if (!outcome.ok) this.#failed(outcome.error)
  }

  /** Stops the run in flight: the agent keeps the message it was writing, marked interrupted. */
  async abort(): Promise<void> {
    await this.#ask({ type: 'abort' })
  }

  /** A message for the run in flight: it arrives now, and changes what the agent does next. */
  async steer(text: string): Promise<void> {
    await this.#ask({ type: 'steer', message: text })
  }

  /** A message for after this run: the agent holds it and takes it up when the run is done. */
  async followUp(text: string): Promise<void> {
    await this.#ask({ type: 'follow_up', message: text })
  }

  /**
   * Emptying what the agent is holding. Its queue is its own and is emptied whole, which is why the
   * workbench keeps its own list for messages that are waiting for a turn: those are Alpha's, and
   * they are taken back one at a time there.
   */
  async cancelQueued(): Promise<void> {
    await this.#ask({ type: 'clear_queue' })
  }

  /** Summarises the history now, which is the same work the agent does when it runs out of room. */
  async compact(): Promise<boolean> {
    return this.#ask({ type: 'compact' })
  }

  /**
   * Whether a run is in flight. It starts false for every runtime, so a run is in flight exactly
   * when this process is running it: a turn that was cut off by a closed window is over, and must
   * not hold an edit against the person after a relaunch.
   */
  isRunning(): boolean {
    return this.#running
  }

  /**
   * Waits for the run this runtime asked for to end. A message is answered as soon as the agent
   * takes it, so whoever asked for one and then needs the whole of it — a regenerate, which hands
   * the window the transcript the new answer is on — waits here rather than guessing.
   */
  async settle(): Promise<void> {
    while (this.#running || this.#waiting) {
      await new Promise<void>((done) => {
        this.#settled = done
      })
    }
  }

  /** The conversation as it stands, for a window that just opened it. */
  async transcript(): Promise<ChatMessage[]> {
    return this.#reader.transcript()
  }

  /** What the session has spent so far, which is what a window opening it has to show. */
  async usage(): Promise<UsageTotals> {
    return this.#reader.usage()
  }

  /** Switches the model this conversation runs on; takes effect on the next turn. */
  async setModel(provider: string, modelId: string): Promise<void> {
    await this.#ask({ type: 'set_model', provider, modelId })
  }

  async setThinkingLevel(level: ThinkingLevel): Promise<void> {
    await this.#ask({ type: 'set_thinking_level', level })
  }

  /** The user's own messages, in order: what a resend or a fork works from. */
  async userEntries(): Promise<AgentEntry[]> {
    return this.#reader.userEntries()
  }

  /**
   * Moves this conversation back to before an entry: the agent forks the session there and this
   * runtime carries on in the copy, so the next turn continues from the fork rather than the end.
   * The id of the copy is what the conversation has to record.
   */
  async forkAt(entryId: string): Promise<Undef<string>> {
    const forked = await this.#reader.forkAt(entryId)
    if (forked === undefined) this.#failed('The agent could not take this conversation back.')
    return forked
  }

  /**
   * Stops a run that is still in flight before closing: closing under one leaves the agent writing
   * into a pipe nobody is reading.
   */
  async close(): Promise<void> {
    if (this.#running) await this.abort()
    await this.#rpc.close()
  }

  /** A command whose refusal is an event rather than an exception; `compact` wants the answer. */
  async #ask(command: { type: string } & Record<string, unknown>): Promise<boolean> {
    const outcome = await this.#rpc.send(command)
    if (!outcome.ok) this.#failed(outcome.error)
    return outcome.ok
  }

  /** A run that is still going when the agent goes away is a run that failed, and says why. */
  #died(): void {
    if (!this.#running && !this.#waiting) return
    this.#running = false
    this.#waiting = false
    const complaint = this.#rpc.stderr.trim()
    this.#emit({
      conversationId: this.#conversationId,
      type: 'run_failed',
      message: complaint === '' ? 'The agent stopped.' : complaint,
    })
    this.#endRun()
  }

  #note(event: RuntimeEvent): void {
    if (event.type === 'turn_started') this.#running = true
    if (event.type === 'turn_finished' || event.type === 'run_failed') this.#endRun()
    this.#emit(event)
  }

  /** The run is over, however it went, and the one caller waiting on settle is told. */
  #endRun(): void {
    this.#running = false
    this.#waiting = false
    const settled = this.#settled
    this.#settled = undefined
    settled?.()
  }

  /**
   * The agent asking whether it may run something. Its gate is Alpha's: the ladder decides, the
   * person is asked when the ladder says to ask, and the answer goes back as a sentence the agent
   * hands to the model as the tool's result.
   */
  async #answerRequest(event: RpcEvent): Promise<void> {
    if (event.method !== 'input' || event.title !== GATE_TITLE) {
      // A question from an extension Alpha did not write: nothing here can answer it, and leaving
      // it unanswered would leave the agent waiting forever.
      this.#rpc.answer({ id: String(event.id), cancelled: true })
      return
    }
    this.#rpc.answer({ id: String(event.id), value: await this.#decide(callIn(event.placeholder)) })
  }

  /** Alpha's answer to a call: allow it, or refuse it in a sentence the model will read. */
  async #decide(call: Record<string, unknown>): Promise<string> {
    if (this.#gate === undefined) return 'allow'
    const callId = typeof call.callId === 'string' ? call.callId : ''
    const gate = this.#gate
    const verdict = await gate({
      toolCallId: callId,
      toolName: typeof call.toolName === 'string' ? call.toolName : '',
      args: record(call.args),
    })
    // The row is already on screen — the agent announced the call before it asked — so how it got
    // through lands on it now.
    this.#emit({ conversationId: this.#conversationId, type: 'tool_decided', callId, approval: verdict.record })
    const reason = verdict.block?.reason
    return reason === undefined || reason === '' ? 'allow' : `deny: ${reason}`
  }

  #failed(error: Undef<string>): void {
    this.#emit({
      conversationId: this.#conversationId,
      type: 'run_failed',
      message: error ?? 'The agent refused.',
    })
  }
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

/** The call the agent asked about: it travels as JSON in a field that is only a string. */
function callIn(placeholder: unknown): Record<string, unknown> {
  if (typeof placeholder !== 'string') return {}
  try {
    return record(JSON.parse(placeholder))
  } catch {
    return {}
  }
}

/**
 * The gate's ports, with the conversation and the workspace filled in by the runtime. Without a
 * permissions port there is no gate to build, and the caller is the one that decided that.
 */
function gatePorts(options: OpenConversationOptions, decisions: Undef<DecisionLedger>): GatePorts {
  const permissions = options.permissions
  if (permissions === undefined) throw new Error('a gate needs the permissions it decides with')
  return {
    ...permissions,
    conversationId: options.conversationId,
    workspacePath: options.process.cwd,
    note: (callId, record) => decisions?.note(callId, record),
  }
}
