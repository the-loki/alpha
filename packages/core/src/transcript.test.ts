import { describe, expect, it } from 'vitest'
import type { ChatMessage, ConversationSummary, RuntimeEvent } from './runtime-events.ts'
import { emptyTranscript, reduceTranscript, streamingMessage, visibleMessages } from './transcript.ts'

const CONVERSATION = 'c1'

const summary: ConversationSummary = {
  id: CONVERSATION,
  workspacePath: '/dev/alpha',
  title: 'New conversation',
  createdAt: 1,
  updatedAt: 1,
  status: 'running',
}

/** Builds an event for the conversation under test, so each case reads as its payload only. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type Payload = DistributiveOmit<RuntimeEvent, 'conversationId'>

const event = (payload: Payload): RuntimeEvent => ({ ...payload, conversationId: CONVERSATION }) as RuntimeEvent

const reduce = (events: RuntimeEvent[]) => events.reduce(reduceTranscript, emptyTranscript(CONVERSATION))

const userMessage: ChatMessage = {
  id: 'u1',
  role: 'user',
  blocks: [{ kind: 'text', text: 'hello' }],
  createdAt: 10,
  status: 'complete',
}

describe('emptyTranscript', () => {
  it('starts idle, empty, with nothing streaming', () => {
    const state = emptyTranscript(CONVERSATION)
    expect(state.messages).toEqual([])
    expect(state.streaming).toBeUndefined()
    expect(state.status).toBe('idle')
  })
})

describe('reduceTranscript', () => {
  it('appends the user message to the transcript', () => {
    const state = reduce([event({ type: 'user_message', message: userMessage })])
    expect(visibleMessages(state)).toEqual([userMessage])
  })

  it('marks the conversation running when the turn starts', () => {
    const state = reduce([event({ type: 'turn_started' })])
    expect(state.status).toBe('running')
  })

  it('accumulates text deltas into the streaming message', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'Hel' }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'lo' }),
    ])
    expect(streamingMessage(state)?.blocks).toEqual([{ kind: 'text', text: 'Hello' }])
  })

  it('keeps thinking separate from the answer, in arrival order', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_thinking_delta', messageId: 'a1', delta: 'weighing' }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'answer' }),
      event({ type: 'assistant_thinking_delta', messageId: 'a1', delta: ' more' }),
    ])
    expect(streamingMessage(state)?.blocks).toEqual([
      { kind: 'thinking', text: 'weighing' },
      { kind: 'text', text: 'answer' },
      { kind: 'thinking', text: ' more' },
    ])
  })

  it('ignores a delta whose message is not the one streaming', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'other', delta: 'stray' }),
    ])
    expect(streamingMessage(state)?.blocks).toEqual([])
  })

  it('moves the streaming message into the transcript when it finishes, exactly once', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'done' }),
      event({ type: 'assistant_message_finished', messageId: 'a1', interrupted: false }),
      event({ type: 'assistant_message_finished', messageId: 'a1', interrupted: false }),
    ])
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].status).toBe('complete')
    expect(state.streaming).toBeUndefined()
  })

  it('marks an interrupted message as interrupted rather than complete', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'half' }),
      event({ type: 'assistant_message_finished', messageId: 'a1', interrupted: true }),
    ])
    expect(state.messages[0].status).toBe('interrupted')
  })

  it('goes back to idle when the turn finishes', () => {
    const state = reduce([event({ type: 'turn_started' }), event({ type: 'turn_finished' })])
    expect(state.status).toBe('idle')
  })

  it('records a failure without losing what was streamed', () => {
    const state = reduce([
      event({ type: 'turn_started' }),
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'partial' }),
      event({ type: 'run_failed', message: 'the provider refused the key' }),
    ])
    expect(state.status).toBe('failed')
    expect(state.error).toBe('the provider refused the key')
    expect(state.messages[0].blocks).toEqual([{ kind: 'text', text: 'partial' }])
    expect(state.messages[0].status).toBe('failed')
  })

  it('replaces everything when the conversation is opened', () => {
    const opened = reduce([
      event({ type: 'assistant_message_started', messageId: 'stale', createdAt: 5 }),
      event({ type: 'conversation_opened', conversation: summary, messages: [userMessage] }),
    ])
    expect(opened.messages).toEqual([userMessage])
    expect(opened.streaming).toBeUndefined()
    expect(opened.status).toBe('idle')
  })

  it('carries the summary that arrived with the opened conversation', () => {
    const opened = reduce([event({ type: 'conversation_opened', conversation: summary, messages: [] })])
    expect(opened.summary).toEqual(summary)
  })

  it('ignores events addressed to a different conversation', () => {
    const state = reduce([{ conversationId: 'other', type: 'user_message', message: userMessage }])
    expect(state.messages).toEqual([])
  })
})

describe('streaming discipline', () => {
  const deltas = (count: number): RuntimeEvent[] => [
    event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
    ...Array.from({ length: count }, (_, index) =>
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: `w${index} ` }),
    ),
  ]

  it('does not touch the transcript while a message is streaming', () => {
    const before = reduce([event({ type: 'user_message', message: userMessage })])
    const during = deltas(200).reduce(reduceTranscript, before)
    expect(during.messages).toBe(before.messages)
  })

  it('appends to the transcript exactly once when the message finishes', () => {
    const finished = reduce([
      ...deltas(200),
      event({ type: 'assistant_message_finished', messageId: 'a1', interrupted: false }),
    ])
    const expected = Array.from({ length: 200 }, (_, index) => `w${index} `).join('')
    expect(finished.messages).toHaveLength(1)
    expect(finished.messages[0].blocks).toEqual([{ kind: 'text', text: expected }])
  })
})

describe('visibleMessages', () => {
  it('shows the streaming message after the completed ones', () => {
    const state = reduce([
      event({ type: 'user_message', message: userMessage }),
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'streaming' }),
    ])
    expect(visibleMessages(state).map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(visibleMessages(state)[1].status).toBe('streaming')
  })
})
