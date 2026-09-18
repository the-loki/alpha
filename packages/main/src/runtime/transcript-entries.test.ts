import type { Entry } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'
import { entriesToMessages } from './transcript-entries.ts'

const entry = (partial: Record<string, unknown>): Entry => partial as unknown as Entry

const userEntry = (seq: number, text: string) =>
  entry({
    type: 'message',
    seq,
    id: `e${seq}`,
    parentId: null,
    timestamp: seq,
    message: { role: 'user', content: text, timestamp: seq },
  })

const assistantEntry = (seq: number, content: unknown[]) =>
  entry({
    type: 'message',
    seq,
    id: `e${seq}`,
    parentId: null,
    timestamp: seq,
    message: { role: 'assistant', content, timestamp: seq, stopReason: 'stop' },
  })

describe('entriesToMessages', () => {
  it('renders a user message and an assistant message in that order', () => {
    const messages = entriesToMessages([
      userEntry(1, 'fix the parser'),
      assistantEntry(2, [{ type: 'text', text: 'Done.' }]),
    ])
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages[1].blocks).toEqual([{ kind: 'text', text: 'Done.' }])
  })

  it('orders the transcript by sequence, whatever order the session returned', () => {
    const messages = entriesToMessages([
      assistantEntry(2, [{ type: 'text', text: 'Done.' }]),
      userEntry(1, 'fix the parser'),
    ])
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  it('keeps thinking blocks separate from the answer', () => {
    const [message] = entriesToMessages([
      assistantEntry(1, [
        { type: 'thinking', text: 'weighing' },
        { type: 'text', text: 'answer' },
      ]),
    ])
    expect(message.blocks).toEqual([
      { kind: 'thinking', text: 'weighing' },
      { kind: 'text', text: 'answer' },
    ])
  })

  it('marks a message that was interrupted', () => {
    const [message] = entriesToMessages([
      entry({
        type: 'message',
        seq: 1,
        id: 'e1',
        parentId: null,
        timestamp: 1,
        message: { role: 'assistant', content: [{ type: 'text', text: 'half' }], timestamp: 1, stopReason: 'aborted' },
      }),
    ])
    expect(message.status).toBe('interrupted')
  })

  it('marks a message that failed', () => {
    const [message] = entriesToMessages([
      entry({
        type: 'message',
        seq: 1,
        id: 'e1',
        parentId: null,
        timestamp: 1,
        message: { role: 'assistant', content: [], timestamp: 1, stopReason: 'error' },
      }),
    ])
    expect(message.status).toBe('failed')
  })

  it('skips entries that are not messages', () => {
    const messages = entriesToMessages([
      entry({ type: 'custom', seq: 1, id: 'e1', parentId: null, timestamp: 1, customType: 'note', data: {} }),
      entry({
        type: 'compaction',
        seq: 2,
        id: 'e2',
        parentId: null,
        timestamp: 2,
        summary: 'sum',
        retainedTail: [],
        tokensBefore: 10,
        fromHook: false,
      }),
      userEntry(3, 'after compaction'),
    ])
    expect(messages.map((message) => message.role)).toEqual(['user'])
  })
})
