import type { RuntimeEvent } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
import { PendingQueue, type QueuePorts, QueueRunner } from './queue.ts'

describe('[runtime] the queue of messages waiting to be sent', () => {
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

describe('[runtime] the runner that moves the queue', () => {
  const harness = (send: (conversationId: string, text: string) => Promise<void>) => {
    const events: RuntimeEvent[] = []
    const ports: QueuePorts = {
      statusOf: () => 'idle',
      send,
      emit: (event) => events.push(event),
    }
    return { events, runner: new QueueRunner(ports) }
  }
  const lastQueueUpdate = (events: RuntimeEvent[]): RuntimeEvent | undefined =>
    events.filter((event) => event.type === 'queue_updated').at(-1)

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
