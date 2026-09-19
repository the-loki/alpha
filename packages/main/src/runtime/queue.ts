/**
 * The messages waiting to be sent, which belong to the workbench rather than to the runtime
 * (ADR-0011). The runtime's own queue is append-only — an entry is written once and only ever
 * deleted — so a message in it cannot be edited, which is the one thing the user asked for. This
 * one is a plain list per conversation: sent one at a time, editable where it stands, and it dies
 * with the process, because a queue that outlived a restart would need an account of what it was
 * waiting for.
 */

import type { QueuedMessage, RuntimeEvent, Undef } from '@alpha/core'

export interface PendingSend {
  id: string
  text: string
}

export class PendingQueue {
  readonly #queues = new Map<string, PendingSend[]>()
  readonly #paused = new Set<string>()

  /** Adds one to the back and answers with it, so the caller can name it in the window. */
  add(conversationId: string, text: string): PendingSend {
    const send: PendingSend = { id: crypto.randomUUID(), text }
    this.#queues.set(conversationId, [...this.#list(conversationId), send])
    return send
  }

  /** In place: editing a message is not the same as typing it again at the back. */
  edit(conversationId: string, id: string, text: string): void {
    this.#queues.set(
      conversationId,
      this.#list(conversationId).map((send) => (send.id === id ? { ...send, text } : send)),
    )
  }

  remove(conversationId: string, id: string): boolean {
    const list = this.#list(conversationId)
    const next = list.filter((send) => send.id !== id)
    this.#queues.set(conversationId, next)
    return next.length !== list.length
  }

  list(conversationId: string): PendingSend[] {
    return [...this.#list(conversationId)]
  }

  /** The head, removed: the caller is about to send it. */
  take(conversationId: string): Undef<PendingSend> {
    const [head, ...rest] = this.#list(conversationId)
    if (head === undefined) return undefined
    this.#queues.set(conversationId, rest)
    return head
  }

  /** Giving one back, when sending it turned out to be impossible. */
  unshift(conversationId: string, send: PendingSend): void {
    this.#queues.set(conversationId, [send, ...this.#list(conversationId)])
  }

  paused(conversationId: string): boolean {
    return this.#paused.has(conversationId)
  }

  pause(conversationId: string): void {
    this.#paused.add(conversationId)
  }

  resume(conversationId: string): void {
    this.#paused.delete(conversationId)
  }

  forget(conversationId: string): void {
    this.#queues.delete(conversationId)
    this.#paused.delete(conversationId)
  }

  #list(conversationId: string): PendingSend[] {
    return this.#queues.get(conversationId) ?? []
  }
}

/** What the runner needs from the workbench: the status it reads, the way it sends, and the window. */
export interface QueuePorts {
  /** The conversation as the index has it, or nothing if it is gone. */
  statusOf: (conversationId: string) => Undef<'idle' | 'running' | 'waiting'>
  send: (conversationId: string, text: string) => Promise<void>
  emit: (event: RuntimeEvent) => void
}

/**
 * The queue of messages waiting for a turn of their own, and the two things the runtime says that
 * move it: a turn that finished sends the next one, and a turn that failed stops it (ADR-0011).
 * The manager owns one of these; nothing else needs to know how a queue is spelled.
 */
export class QueueRunner {
  readonly #queue = new PendingQueue()
  readonly #steers = new Map<string, QueuedMessage[]>()
  readonly #ports: QueuePorts

  constructor(ports: QueuePorts) {
    this.#ports = ports
  }

  /** Queuing one, and sending it at once if nothing is in the way. */
  async add(conversationId: string, text: string): Promise<void> {
    this.#queue.add(conversationId, text)
    this.#emit(conversationId)
    await this.flush(conversationId)
  }

  edit(conversationId: string, entryId: string, text: string): void {
    this.#queue.edit(conversationId, entryId, text)
    this.#emit(conversationId)
  }

  /** Answers whether the id was the workbench's; the lane's own queue holds the steers. */
  cancel(conversationId: string, entryId: string): boolean {
    const mine = this.#queue.remove(conversationId, entryId)
    if (mine) this.#emit(conversationId)
    return mine
  }

  /** Started again by hand, after a failure or a Stop. */
  async resume(conversationId: string): Promise<void> {
    this.#queue.resume(conversationId)
    this.#emit(conversationId)
    await this.flush(conversationId)
  }

  /** Stop means stop: the queue waits too, rather than firing as soon as the turn is cut short. */
  stop(conversationId: string): void {
    this.#queue.pause(conversationId)
    this.#emit(conversationId)
  }

  /** What the lane is still holding for the running turn, which the window shows beside ours. */
  rememberSteers(conversationId: string, steers: QueuedMessage[]): void {
    this.#steers.set(conversationId, steers)
    this.#emit(conversationId)
  }

  forget(conversationId: string): void {
    this.#queue.forget(conversationId)
    this.#steers.delete(conversationId)
  }

  /**
   * Sending the head, if there is one and nothing is in the way. Called when a turn ends normally
   * and when the queue is started again — the two ways a queue moves.
   */
  async flush(conversationId: string): Promise<void> {
    if (this.#queue.paused(conversationId)) return
    if (this.#ports.statusOf(conversationId) !== 'idle') return
    const head = this.#queue.take(conversationId)
    if (head === undefined) return
    this.#emit(conversationId)
    try {
      await this.#ports.send(conversationId, head.text)
    } catch {
      // It could not be sent at all — no model, a closed runtime — so it goes back where it was and
      // the queue stops rather than losing the message or hammering the same failure. The pause is
      // the answer the window gets; a background send has nobody to throw at.
      this.#queue.unshift(conversationId, head)
      this.#queue.pause(conversationId)
      this.#emit(conversationId)
    }
  }

  /**
   * Everything waiting in one conversation, in the order it will be sent: what the runtime is
   * holding for this turn, then what the workbench is holding for the next one. One event, so the
   * window never has to know which side a row came from.
   */
  #emit(conversationId: string): void {
    const queued: QueuedMessage[] = [
      ...(this.#steers.get(conversationId) ?? []),
      ...this.#queue
        .list(conversationId)
        .map((send) => ({ entryId: send.id, text: send.text, kind: 'queued' as const })),
    ]
    this.#ports.emit({
      conversationId,
      type: 'queue_updated',
      queued,
      paused: this.#queue.paused(conversationId),
    })
  }
}
