import type { AgentEntry } from '@alpha/sessions'
import { describe, expect, it } from 'vitest'
import { alignedHistoryOf, contextOf } from './history.ts'

/** An entry as the store writes it: identified, chained, carrying its message. */
const message = (id: string, role: string, text: string): AgentEntry => ({
  type: 'message',
  id,
  parentId: null,
  timestamp: 1,
  message: { role, content: [{ type: 'text', text }] },
})

describe('the context an agent starts with', () => {
  it('carries the session’s messages verbatim, in transcript order', () => {
    const messages = contextOf([
      message('e1', 'user', 'hello'),
      message('e2', 'assistant', 'hi there'),
      {
        type: 'message',
        id: 'e3',
        parentId: null,
        timestamp: 1,
        message: {
          role: 'toolResult',
          toolCallId: 'call-1',
          content: [{ type: 'text', text: 'done' }],
          isError: false,
        },
      },
    ])
    expect(messages).toHaveLength(3)
    expect(messages[0]).toMatchObject({ role: 'user', content: [{ type: 'text', text: 'hello' }] })
    expect(messages[1]).toMatchObject({ role: 'assistant', content: [{ type: 'text', text: 'hi there' }] })
    expect(messages[2]).toMatchObject({ role: 'toolResult', toolCallId: 'call-1' })
  })

  it('a compaction collapses everything before it into one user message carrying the summary', () => {
    const messages = contextOf([
      message('e1', 'user', 'earlier question'),
      message('e2', 'assistant', 'earlier answer'),
      { type: 'compaction', id: 'e3', parentId: null, timestamp: 1, summary: 'They discussed naming.' },
      message('e4', 'user', 'and after'),
    ])
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'They discussed naming.' }],
    })
    expect(messages[1]).toMatchObject({ role: 'user', content: [{ type: 'text', text: 'and after' }] })
  })

  it('skips entries that are not messages, and answers an empty session with an empty context', () => {
    expect(contextOf([{ type: 'summary', id: 'e1', parentId: null, timestamp: 1, summary: 'x' }])).toEqual([])
    expect(contextOf([])).toEqual([])
  })
})

describe('the entries each message came from', () => {
  it('message entries name themselves, and a summary standing in for older messages has none', () => {
    const history = alignedHistoryOf([
      message('e1', 'user', 'hello'),
      message('e2', 'assistant', 'hi there'),
      { type: 'compaction', id: 'e3', parentId: null, timestamp: 1, summary: 'They discussed naming.' },
      message('e4', 'user', 'and after'),
    ])
    expect(history.messages.map((one) => one.role)).toEqual(['user', 'user'])
    expect(history.entryIds).toEqual([undefined, 'e4'])
    expect(JSON.stringify(history.messages[0])).toContain('They discussed naming.')
  })
})
