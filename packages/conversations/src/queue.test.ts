import type { RuntimeEvent } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
import { PendingQueue, type QueuePorts, QueueRunner } from './queue.ts'

describe('[conversations] the queue of messages waiting to be sent', () => {
  it('keeps them in the order they were typed, and hands out one at a time', () => {
    const queue = new PendingQueue()
    queue.add('c1', 'first')
    queue.add('c1', 'second')

    expect(queue.list('c1').map((send) => send.text)).toEqual(['first', 'second'])
    expect(queue.take('c1')?.text).toBe('first')
    expect(queue.list('c1').map((send) => send.text)).toEqual(['second'])
    expect(queue.take('c1')?.text).toBe('second')
    expect(queue.take('c1')).toBeUndefined()
  })

  it('edits one where it stands, rather than moving it to the back', () => {
    const queue = new PendingQueue()
    queue.add('c1', 'first')
    const second = queue.add('c1', 'second')
    queue.add('c1', 'third')

    queue.edit('c1', second.id, 'second, but better')
    expect(queue.list('c1').map((send) => send.text)).toEqual(['first', 'second, but better', 'third'])
  })

  it('takes one back, and says nothing about one it never had', () => {
    const queue = new PendingQueue()
    const first = queue.add('c1', 'first')
    queue.add('c1', 'second')

    expect(queue.remove('c1', first.id)).toBe(true)
    expect(queue.list('c1').map((send) => send.text)).toEqual(['second'])
    expect(queue.remove('c1', 'never-seen')).toBe(false)
  })

  it('stops handing them out while it is paused, and starts again when it is not', () => {
    const queue = new PendingQueue()
    queue.add('c1', 'first')
    queue.pause('c1')
    expect(queue.paused('c1')).toBe(true)

    queue.pause('c2')
    expect(queue.paused('c2')).toBe(true)
    expect(queue.paused('c1')).toBe(true)
    queue.resume('c1')
    expect(queue.paused('c1')).toBe(false)
  })

  it('keeps one conversation out of another', () => {
    const queue = new PendingQueue()
    queue.add('c1', 'mine')
    queue.add('c2', 'yours')
    expect(queue.list('c1').map((send) => send.text)).toEqual(['mine'])
    expect(queue.list('c2').map((send) => send.text)).toEqual(['yours'])
    expect(queue.list('c3')).toEqual([])
  })

  it('forgets a conversation entirely when it is gone', () => {
    const queue = new PendingQueue()
    queue.add('c1', 'first')
    queue.pause('c1')
    queue.forget('c1')
    expect(queue.list('c1')).toEqual([])
    expect(queue.paused('c1')).toBe(false)
    expect(queue.take('c1')).toBeUndefined()
  })
})

describe('[conversations] the runner that moves the queue', () => {
  const harness = (
    send: (conversationId: string, text: string) => Promise<void>,
    status: 'idle' | 'running' | 'waiting' = 'idle',
  ) => {
    const events: RuntimeEvent[] = []
    const ports: QueuePorts = {
      statusOf: () => status,
      send,
      emit: (event) => events.push(event),
    }
    return { events, runner: new QueueRunner(ports) }
  }
  const lastQueueUpdate = (events: RuntimeEvent[]): RuntimeEvent | undefined =>
    events.filter((event) => event.type === 'queue_updated').at(-1)
  /** What the window is showing: the texts of the rows in the last event, oldest first. */
  const textsOf = (events: RuntimeEvent[]): string[] => {
    const last = lastQueueUpdate(events)
    return last?.type === 'queue_updated' ? last.queued.map((row) => row.text) : []
  }

  it('lists every steer the turn was sent, oldest first, and lets them all go with the turn', async () => {
    const { events, runner } = harness(async () => undefined, 'running')
    await runner.add('c1', 'waiting its turn')

    runner.steerSent('c1', 'one')
    runner.steerSent('c1', 'two')
    // Both are on their way into the turn and neither is answered yet: the second steer writing
    // over the first is the strip losing a message the person really sent.
    expect(textsOf(events)).toEqual(['one', 'two', 'waiting its turn'])
    const steered = lastQueueUpdate(events)
    expect(steered?.type === 'queue_updated' ? steered.queued.map((row) => row.kind) : []).toEqual([
      'steer',
      'steer',
      'queued',
    ])

    // The turn ended — it finished, failed, or was stopped — and nothing is held for a turn that
    // is over. What waits for the turn after it was never the steers' business.
    runner.steerCleared('c1')
    expect(textsOf(events)).toEqual(['waiting its turn'])
  })

  it('hands the head to the send port and empties itself', async () => {
    const sent: string[] = []
    const { events, runner } = harness(async (_conversationId, text) => void sent.push(text))

    await runner.add('c1', 'only')

    expect(sent).toEqual(['only'])
    expect(lastQueueUpdate(events)).toMatchObject({ paused: false, queued: [] })
  })

  it('puts an unsent message back at the head and stops, rather than losing it', async () => {
    const { events, runner } = harness(async () => {
      throw new Error('no model to send with')
    })

    await runner.add('c1', 'keep me')
    await runner.add('c1', 'and me')

    expect(lastQueueUpdate(events)).toMatchObject({
      paused: true,
      queued: [
        { text: 'keep me', kind: 'queued' },
        { text: 'and me', kind: 'queued' },
      ],
    })
  })
})
