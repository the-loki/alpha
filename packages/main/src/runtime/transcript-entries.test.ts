import { describe, expect, it } from 'vitest'
import { type AgentEntry, entriesToMessages } from './transcript-entries.ts'

const entry = (partial: Record<string, unknown>): AgentEntry => partial as unknown as AgentEntry

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

describe('[runtime] entriesToMessages', () => {
  it('renders a user message and an assistant message in that order', () => {
    const messages = entriesToMessages([
      userEntry(1, 'fix the parser'),
      assistantEntry(2, [{ type: 'text', text: 'Done.' }]),
    ])
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages[1].blocks).toEqual([{ kind: 'text', text: 'Done.' }])
  })

  it('gives back the picture a user message was sent with', () => {
    const [message] = entriesToMessages([
      entry({
        type: 'message',
        id: 'e1',
        parentId: null,
        timestamp: 1,
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'the layout is off' },
            { type: 'image', data: 'AA==', mimeType: 'image/png' },
          ],
          timestamp: 1,
        },
      }),
    ])
    expect(message.blocks).toEqual([
      { kind: 'text', text: 'the layout is off' },
      { kind: 'attachment', mimeType: 'image/png', data: 'AA==' },
    ])
  })

  it('keeps the order it was handed, which is the order the path was walked in', () => {
    const messages = entriesToMessages([
      userEntry(1, 'fix the parser'),
      assistantEntry(2, [{ type: 'text', text: 'Done.' }]),
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
        id: 'e1',
        parentId: null,
        timestamp: 1,
        message: { role: 'assistant', content: [], timestamp: 1, stopReason: 'error' },
      }),
    ])
    expect(message.status).toBe('failed')
  })

  it('turns a compaction into the marker that stands where the history was summarised', () => {
    const messages = entriesToMessages([
      userEntry(1, 'before'),
      entry({
        type: 'compaction',
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

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages[1].blocks).toEqual([{ kind: 'compaction', summary: 'sum', replaced: undefined }])
  })

  it('stamps a restored tool row with how it got past the gate', () => {
    const call = assistantEntry(1, [
      { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'rm -rf build' } },
    ])
    const result = entry({
      type: 'message',
      id: 'e2',
      parentId: null,
      timestamp: 2,
      message: {
        role: 'toolResult',
        toolCallId: 'call-1',
        isError: false,
        content: [{ type: 'text', text: 'done' }],
        timestamp: 2,
      },
    })
    const decisions = new Map([['call-1', { kind: 'once' as const, level: 'ask' as const }]])

    const [message] = entriesToMessages([call, result], decisions)
    const block = message.blocks[0]
    expect(block.kind === 'tool' && block.approval).toEqual({ kind: 'once', level: 'ask' })
    // Without a decision on record the row is still a row: the note is what is missing, not the call.
    const [bare] = entriesToMessages([call, result])
    expect(bare.blocks[0].kind === 'tool' && bare.blocks[0].approval).toBeUndefined()
  })

  it('skips entries that are not messages', () => {
    const messages = entriesToMessages([
      entry({ type: 'custom', seq: 1, id: 'e1', parentId: null, timestamp: 1, customType: 'note', data: {} }),
      entry({ type: 'custom', seq: 2, id: 'e2', parentId: null, timestamp: 2, customType: 'note', data: {} }),
      userEntry(3, 'after compaction'),
    ])
    expect(messages.map((message) => message.role)).toEqual(['user'])
  })
})
