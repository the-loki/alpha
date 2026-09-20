/**
 * The conversation's other end: one child process running `pi --mode rpc`, and this file, which
 * sends commands down its stdin and reads records off its stdout.
 *
 * Two rules are the whole of the protocol here. Records are LF-delimited JSON, split on `\n` and
 * nothing else (see `frames.ts` for why that matters). And every command carries an `id` that its
 * answer carries back, which is the only way to tell one answer from another when events are
 * streaming between them.
 *
 * Nothing here throws at a caller: a command the agent refused, a command it never answered, and a
 * child that has died are all answers of the same shape, because a window that has to catch
 * exceptions is a window that shows a blank page when something ordinary happens.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { FrameReader, frame } from './frames.ts'

export interface RpcOutcome {
  ok: boolean
  data?: unknown
  error?: string
}

/** A record the agent sent that is not an answer: something that happened, or a question to us. */
export interface RpcEvent {
  type: string
  [field: string]: unknown
}

export interface OpenRpcOptions {
  file: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  /** How long a command waits for its answer. Long, because a model call is slow, but not never. */
  answerWithinMs?: number
}

/** The default patience for an answer: generous for a slow first token, finite for a dead agent. */
const ANSWER_WITHIN_MS = 120_000

/** How much of the child's stderr is kept for the moment somebody asks what went wrong. */
const STDERR_KEPT = 65_536

/**
 * What the agent is started with: the session it is to run — named by Alpha's own conversation id,
 * so the file it writes is the conversation's file — where its sessions go, and what it is called.
 *
 * `existing` is for a session that already has an id of the agent's own, which is what a fork
 * leaves behind: `--session-id` names a session to start, `--session` finds one to continue.
 */
export function rpcArgs(options: {
  sessionsDirectory: string
  sessionId: string
  name: string
  existing?: boolean
}): string[] {
  return [
    '--mode',
    'rpc',
    '--session-dir',
    options.sessionsDirectory,
    options.existing === true ? '--session' : '--session-id',
    options.sessionId,
    '--name',
    options.name,
  ]
}

/**
 * The environment the agent runs in. Alpha is local-first, so the agent is told not to check for
 * updates, not to report anything, and to keep its configuration in Alpha's own directory rather
 * than in the `~/.pi` of the person, which Alpha has no business rewriting.
 */
export function rpcEnv(env: NodeJS.ProcessEnv, agentDirectory: string): NodeJS.ProcessEnv {
  return {
    ...env,
    PI_OFFLINE: '1',
    PI_TELEMETRY: '0',
    PI_SKIP_VERSION_CHECK: '1',
    PI_CODING_AGENT_DIR: agentDirectory,
  }
}

export class AgentRpc {
  readonly #child: ChildProcess
  readonly #answerWithinMs: number
  readonly #waiting = new Map<string, (outcome: RpcOutcome) => void>()
  readonly #events = new Set<(event: RpcEvent) => void>()
  readonly #exits = new Set<() => void>()
  #stderr = ''
  #counter = 0
  #gone = false

  private constructor(child: ChildProcess, answerWithinMs: number) {
    this.#child = child
    this.#answerWithinMs = answerWithinMs
  }

  static open(options: OpenRpcOptions): AgentRpc {
    const child = spawn(options.file, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const rpc = new AgentRpc(child, options.answerWithinMs ?? ANSWER_WITHIN_MS)
    rpc.#read(child)
    return rpc
  }

  get gone(): boolean {
    return this.#gone
  }

  /** What the child wrote to stderr, newest last: the agent's own complaints, kept for the panel. */
  get stderr(): string {
    return this.#stderr
  }

  onEvent(listener: (event: RpcEvent) => void): () => void {
    this.#events.add(listener)
    return () => {
      this.#events.delete(listener)
    }
  }

  /** Told once, when the child is gone, whoever is driving the conversation can settle it. */
  onExit(listener: () => void): () => void {
    this.#exits.add(listener)
    return () => {
      this.#exits.delete(listener)
    }
  }

  /**
   * Sends one command and answers with what came back: the agent's data, the agent's refusal, or
   * the reason there is no answer at all. The `id` is minted here, so a caller never invents one.
   */
  async send(command: { type: string } & Record<string, unknown>): Promise<RpcOutcome> {
    if (this.#gone) return gone()
    this.#counter += 1
    const id = `alpha-${this.#counter}`
    return new Promise<RpcOutcome>((settle) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(id)
        settle({ ok: false, error: `the agent did not answer "${command.type}" within ${this.#answerWithinMs}ms` })
      }, this.#answerWithinMs)
      this.#waiting.set(id, (outcome) => {
        clearTimeout(timer)
        settle(outcome)
      })
      this.#child.stdin?.write(frame({ ...command, id }))
    })
  }

  /**
   * Answers a question the agent asked (`extension_ui_request`). It is not a command and has no
   * answer of its own, so it does not go through `send`: it is written and forgotten.
   */
  answer(response: { id: string; value?: string; confirmed?: boolean; cancelled?: boolean }): void {
    if (this.#gone) return
    this.#child.stdin?.write(frame({ type: 'extension_ui_response', ...response }))
  }

  /** Ends the conversation: the child is asked to stop, and killed if it will not. */
  async close(): Promise<void> {
    if (this.#gone) return
    const child = this.#child
    const ended = new Promise<void>((done) => child.once('exit', () => done()))
    child.kill('SIGTERM')
    const impatient = setTimeout(() => child.kill('SIGKILL'), 2000)
    await ended
    clearTimeout(impatient)
    this.#died()
  }

  #read(child: ChildProcess): void {
    const reader = new FrameReader()
    child.stdout?.on('data', (chunk: Buffer) => {
      for (const record of reader.push(chunk.toString()).records) this.#record(record)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      this.#stderr = `${this.#stderr}${chunk.toString()}`.slice(-STDERR_KEPT)
    })
    child.on('error', (error) => {
      this.#stderr = `${this.#stderr}${error.message}\n`.slice(-STDERR_KEPT)
      this.#died()
    })
    child.on('exit', () => this.#died())
  }

  /** An answer goes to whoever is waiting for that id; anything else is an event. */
  #record(raw: unknown): void {
    const record = raw as RpcEvent
    if (record.type !== 'response') {
      for (const listener of [...this.#events]) listener(record)
      return
    }
    const id = typeof record.id === 'string' ? record.id : ''
    const settle = this.#waiting.get(id)
    if (settle === undefined) return
    this.#waiting.delete(id)
    settle(
      record.success === true
        ? { ok: true, data: record.data }
        : { ok: false, error: typeof record.error === 'string' ? record.error : 'the agent refused' },
    )
  }

  /** The child has gone: everyone waiting is told, and everyone listening hears it once. */
  #died(): void {
    if (this.#gone) return
    this.#gone = true
    for (const settle of this.#waiting.values()) settle(gone())
    this.#waiting.clear()
    for (const listener of [...this.#exits]) listener()
  }
}

function gone(): RpcOutcome {
  return { ok: false, error: 'the agent is gone' }
}
