/**
 * The messages waiting to be sent, which belong to the workbench rather than to the runtime
 * (ADR-0011). The runtime's own queue is append-only — an entry is written once and only ever
 * deleted — so a message in it cannot be edited, which is the one thing the user asked for. This
 * one is a plain list per conversation: sent one at a time, editable where it stands, and it dies
 * with the process, because a queue that outlived a restart would need an account of what it was
 * waiting for.
 */

import type { QueuedMessage, RuntimeEvent, Undef } from '@alpha/domain'

export interface PendingSend {
  id: string
  text: string
}

export class PendingQueue {
  private readonly queues = new Map<string, PendingSend[]>()
  private readonly pausedIds = new Set<string>()

  /** Adds one to the back and answers with it, so the caller can name it in the window. */
  public add(conversationId: string, text: string): PendingSend {
    const send: PendingSend = { id: crypto.randomUUID(), text }
    this.queues.set(conversationId, [...this.queued(conversationId), send])
    return send
  }

  /** In place: editing a message is not the same as typing it again at the back. */
  public edit(conversationId: string, id: string, text: string): void {
    this.queues.set(
      conversationId,
      this.queued(conversationId).map((send) => (send.id === id ? { ...send, text } : send)),
    )
  }

  public remove(conversationId: string, id: string): boolean {
    const list = this.queued(conversationId)
    const next = list.filter((send) => send.id !== id)
    this.queues.set(conversationId, next)
    return next.length !== list.length
  }

  public list(conversationId: string): PendingSend[] {
    return [...this.queued(conversationId)]
  }

  /** The head, removed: the caller is about to send it. */
  public take(conversationId: string): Undef<PendingSend> {
    const [head, ...rest] = this.queued(conversationId)
    if (head === undefined) return undefined
    this.queues.set(conversationId, rest)
    return head
  }

  /** Giving one back, when sending it turned out to be impossible. */
  public unshift(conversationId: string, send: PendingSend): void {
    this.queues.set(conversationId, [send, ...this.queued(conversationId)])
  }

  public paused(conversationId: string): boolean {
    return this.pausedIds.has(conversationId)
  }

  public pause(conversationId: string): void {
    this.pausedIds.add(conversationId)
  }

  public resume(conversationId: string): void {
    this.pausedIds.delete(conversationId)
  }

  public forget(conversationId: string): void {
    this.queues.delete(conversationId)
    this.pausedIds.delete(conversationId)
  }

  private queued(conversationId: string): PendingSend[] {
    return this.queues.get(conversationId) ?? []
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
 * What waits, of both kinds (ADR-0011): the messages waiting for a turn of their own, and the ones
 * steered into the turn that is running. Both are the workbench's — the lane is told, it does not
 * keep the book — and this is the one place the window is told, `queue_updated` per change.
 *
 * The two things the runtime's events move: a turn that finished sends the next message, and a
 * turn that failed stops the queue. The manager owns one of these; nothing else needs to know how
 * a queue is spelled.
 */
export class QueueRunner {
  private readonly queue = new PendingQueue()
  /** What each running turn was steered with, oldest first, until that turn is over. */
  private readonly steers = new Map<string, QueuedMessage[]>()
  private readonly ports: QueuePorts

  public constructor(ports: QueuePorts) {
    this.ports = ports
  }

  /** Queuing one, and sending it at once if nothing is in the way. */
  public async add(conversationId: string, text: string): Promise<void> {
    this.queue.add(conversationId, text)
    this.emit(conversationId)
    await this.flush(conversationId)
  }

  public edit(conversationId: string, entryId: string, text: string): void {
    this.queue.edit(conversationId, entryId, text)
    this.emit(conversationId)
  }

  /**
   * Answers whether the message was one waiting for a turn of its own: those are taken back here.
   * A steer has to be dropped by the lane as well, so that half is the manager's.
   */
  public cancel(conversationId: string, entryId: string): boolean {
    const mine = this.queue.remove(conversationId, entryId)
    if (mine) this.emit(conversationId)
    return mine
  }

  /** Started again by hand, after a failure or a Stop. */
  public async resume(conversationId: string): Promise<void> {
    this.queue.resume(conversationId)
    this.emit(conversationId)
    await this.flush(conversationId)
  }

  /** Stop means stop: the queue waits too, rather than firing as soon as the turn is cut short. */
  public stop(conversationId: string): void {
    this.queue.pause(conversationId)
    this.emit(conversationId)
  }

  /**
   * A message sent into the turn that is running. It is listed for as long as that turn lasts: the
   * lane drains one steering message per turn boundary and writes it into the conversation, but it
   * says nothing when it does — pi's agent has no event for it — so the honest thing the window can
   * be told is that this turn was steered with it, until the turn is over.
   */
  public steerSent(conversationId: string, text: string): void {
    const steers = this.steers.get(conversationId) ?? []
    this.steers.set(conversationId, [...steers, { entryId: crypto.randomUUID(), text, kind: 'steer' }])
    this.emit(conversationId)
  }

  /** A turn that is over holds nothing, whatever became of the messages it was steered with. */
  public steerCleared(conversationId: string): void {
    const steers = this.steers.get(conversationId)
    if (steers === undefined || steers.length === 0) return
    this.steers.delete(conversationId)
    this.emit(conversationId)
  }

  public forget(conversationId: string): void {
    this.queue.forget(conversationId)
    this.steers.delete(conversationId)
  }

  /**
   * Sending the head, if there is one and nothing is in the way. Called when a turn ends normally
   * and when the queue is started again — the two ways a queue moves.
   */
  public async flush(conversationId: string): Promise<void> {
    if (this.queue.paused(conversationId)) return
    if (this.ports.statusOf(conversationId) !== 'idle') return
    const head = this.queue.take(conversationId)
    if (head === undefined) return
    this.emit(conversationId)
    try {
      await this.ports.send(conversationId, head.text)
    } catch {
      // It could not be sent at all — no model, a closed runtime — so it goes back where it was and
      // the queue stops rather than losing the message or hammering the same failure. The pause is
      // the answer the window gets; a background send has nobody to throw at.
      this.queue.unshift(conversationId, head)
      this.queue.pause(conversationId)
      this.emit(conversationId)
    }
  }

  /**
   * Everything waiting in one conversation, in the order it will be sent: what the running turn was
   * steered with, then what waits for the turn after it. One event, so the window never has to know
   * which side a row came from.
   */
  private emit(conversationId: string): void {
    const queued: QueuedMessage[] = [
      ...(this.steers.get(conversationId) ?? []),
      ...this.queue
        .list(conversationId)
        .map((send) => ({ entryId: send.id, text: send.text, kind: 'queued' as const })),
    ]
    this.ports.emit({
      conversationId,
      type: 'queue_updated',
      queued,
      paused: this.queue.paused(conversationId),
    })
  }
}
