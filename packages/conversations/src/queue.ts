/**
 * The messages waiting to be sent, which belong to the workbench rather than to the runtime
 * (ADR-0011). The runtime's own queue is append-only — an entry is written once and only ever
 * deleted — so a message in it cannot be edited, which is the one thing the user asked for. This
 * one is a plain list per conversation: sent one at a time, editable where it stands, and it dies
 * with the process, because a queue that outlived a restart would need an account of what it was
 * waiting for.
 */

import { type QueuedMessage, type RuntimeEvent, type TurnRefusal, textOfBlocks, type Undef } from '@alpha/domain'

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
  send: (conversationId: string, text: string) => Promise<Undef<TurnRefusal>>
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
   * A message sent into the turn that is running. It is listed until the lane takes it: the lane
   * drains one steering message per turn boundary, and it says so when it does — the message comes
   * back as a message of the run — which is what `steerTaken` is told.
   */
  public steerSent(conversationId: string, text: string): void {
    const steers = this.steers.get(conversationId) ?? []
    this.steers.set(conversationId, [...steers, { entryId: crypto.randomUUID(), text, kind: 'steer' }])
    this.emit(conversationId)
  }

  /** Remove one steer and answer what the lane must still hold, in order. */
  public cancelSteer(conversationId: string, entryId: string): Undef<string[]> {
    const steers = this.steers.get(conversationId) ?? []
    const remaining = steers.filter((steer) => steer.entryId !== entryId)
    if (remaining.length === steers.length) return undefined
    this.steers.set(conversationId, remaining)
    this.emit(conversationId)
    return remaining.map((steer) => steer.text)
  }

  /**
   * The lane took one: it is in the conversation now, so it is no longer waiting for anything, and
   * the first steer still listed that said this is what it took. What is left on the list is what
   * has not been taken yet — in `one-at-a-time` mode that is a second steer sent before the first
   * was drained, which is really still waiting.
   */
  public steerTaken(conversationId: string, text: string): void {
    const steers = this.steers.get(conversationId)
    if (steers === undefined) return
    const at = steers.findIndex((steer) => steer.text === text)
    if (at === -1) return
    this.steers.set(
      conversationId,
      steers.filter((_steer, index) => index !== at),
    )
    this.emit(conversationId)
  }

  /** A turn that is over holds nothing, whatever became of the messages it was steered with. */
  public steerCleared(conversationId: string): void {
    const steers = this.steers.get(conversationId)
    if (steers === undefined || steers.length === 0) return
    this.steers.delete(conversationId)
    this.emit(conversationId)
  }

  /**
   * One runtime event, and what it does to what waits (ADR-0011): the run takes a message it was
   * steered with, a turn that ended holds nothing, a failure stops the queue, and a turn that ends
   * sends what follows it.
   *
   * A refusal is none of those. Nothing ran, so nothing the lane holds becomes unstuck, and there is
   * no turn to end and send what waits — the queue's own send is where a refusal is held instead,
   * because it is the sender that knows the message never went. Neither is a refusal the failure that
   * stops a queue for good: the model it was refused for is usually one setting away from working.
   */
  public observe(event: RuntimeEvent): void {
    if (event.type === 'user_message') this.steerTaken(event.conversationId, textOfBlocks(event.message.blocks))
    if (event.type === 'turn_finished' || event.type === 'run_failed') this.steerCleared(event.conversationId)
    if (event.type === 'run_failed') this.stop(event.conversationId)
    if (event.type === 'turn_finished') void this.flush(event.conversationId)
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
      // A refusal is answered rather than thrown: the turn did not start, and the case says why —
      // which is the same ending for the queue as a send that could not happen at all.
      const refusal = await this.ports.send(conversationId, head.text)
      if (refusal !== undefined) this.hold(conversationId, head)
    } catch {
      this.hold(conversationId, head)
    }
  }

  /**
   * A message that never went is put back where it was and the queue stops, rather than losing it or
   * hammering the same refusal at every turn boundary. The pause is the answer the window gets: a
   * background send has nobody to throw at. What the refusal was has already been said to the
   * conversation.
   */
  private hold(conversationId: string, message: PendingSend): void {
    this.queue.unshift(conversationId, message)
    this.queue.pause(conversationId)
    this.emit(conversationId)
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
