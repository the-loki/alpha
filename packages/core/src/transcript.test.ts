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
  model: { providerId: 'faux', modelId: 'scripted' },
  thinkingLevel: 'medium',
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
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'Hel', at: 30 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'lo', at: 30 }),
    ])
    expect(streamingMessage(state)?.blocks).toEqual([{ kind: 'text', text: 'Hello' }])
  })

  it('keeps thinking separate from the answer, in arrival order', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_thinking_delta', messageId: 'a1', delta: 'weighing', at: 30 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'answer', at: 31 }),
      event({ type: 'assistant_thinking_delta', messageId: 'a1', delta: ' more', at: 32 }),
    ])
    expect(streamingMessage(state)?.blocks).toEqual([
      { kind: 'thinking', text: 'weighing', startedAt: 30, endedAt: 30 },
      { kind: 'text', text: 'answer' },
      { kind: 'thinking', text: ' more', startedAt: 32, endedAt: 32 },
    ])
  })

  it('gives a thinking block the span from its first delta to its last', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_thinking_delta', messageId: 'a1', delta: 'weighing', at: 30 }),
      event({ type: 'assistant_thinking_delta', messageId: 'a1', delta: ' it', at: 90 }),
      event({ type: 'assistant_thinking_delta', messageId: 'a1', delta: ' up', at: 150 }),
    ])
    const block = streamingMessage(state)?.blocks[0]
    expect(block).toMatchObject({ kind: 'thinking', startedAt: 30, endedAt: 150 })
  })

  it('ignores a delta whose message is not the one streaming', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'other', delta: 'stray', at: 30 }),
    ])
    expect(streamingMessage(state)?.blocks).toEqual([])
  })

  it('moves the streaming message into the transcript when it finishes, exactly once', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'done', at: 30 }),
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
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'half', at: 30 }),
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
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'partial', at: 30 }),
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
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: `w${index} `, at: 30 + index }),
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
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'streaming', at: 30 }),
    ])
    expect(visibleMessages(state).map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(visibleMessages(state)[1].status).toBe('streaming')
  })
})

describe('the tool ledger', () => {
  const callId = 'call-1'

  const started = event({
    type: 'tool_started',
    callId,
    name: 'read',
    risk: 'read',
    summary: 'src/index.ts',
    raw: '{"path":"src/index.ts"}',
    startedAt: 30,
  })

  const withCall = () =>
    reduce([
      event({ type: 'user_message', message: userMessage }),
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'Reading it.', at: 30 }),
      event({ type: 'assistant_message_finished', messageId: 'a1', interrupted: false }),
      started,
    ])

  it('attaches the row to the assistant message that asked for the call', () => {
    const state = withCall()
    const assistant = state.messages.find((message) => message.role === 'assistant')
    expect(assistant?.blocks.at(-1)).toMatchObject({
      kind: 'tool',
      callId,
      name: 'read',
      risk: 'read',
      summary: 'src/index.ts',
      status: 'running',
      output: '',
    })
  })

  it('does not add a message of its own for the call', () => {
    expect(withCall().messages).toHaveLength(2)
  })

  it('carries the risk class the runtime decided, not one the UI invents', () => {
    const state = reduce([
      event({ type: 'user_message', message: userMessage }),
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      started,
    ])
    const block = state.streaming?.blocks.at(-1)
    expect(block).toMatchObject({ kind: 'tool', risk: 'read' })
  })

  it('shows output as it arrives', () => {
    const state = reduce([
      ...[],
      ...withCallEvents(5),
      event({ type: 'tool_output', callId, output: 'partial output' }),
    ])
    expect(toolBlock(state)?.output).toBe('partial output')
  })

  it('records the end of the call with its details', () => {
    const state = reduce([
      ...withCallEvents(5),
      event({
        type: 'tool_finished',
        callId,
        status: 'failed',
        output: 'command not found',
        details: { exitCode: 127, truncated: true, fullOutputPath: '/tmp/full.log' },
        endedAt: 99,
      }),
    ])
    expect(toolBlock(state)).toMatchObject({
      status: 'failed',
      output: 'command not found',
      endedAt: 99,
      details: { exitCode: 127, truncated: true, fullOutputPath: '/tmp/full.log' },
    })
  })

  it('ignores output for a call it never saw start', () => {
    const state = reduce([event({ type: 'tool_output', callId: 'stranger', output: 'noise' })])
    expect(state.messages).toEqual([])
  })

  it('keeps two calls in the order they started', () => {
    const state = reduce([
      ...withCallEvents(5),
      event({
        type: 'tool_started',
        callId: 'call-2',
        name: 'bash',
        risk: 'execute',
        summary: 'ls',
        raw: '{}',
        startedAt: 40,
      }),
    ])
    const assistant = state.messages.find((message) => message.role === 'assistant')
    expect(assistant?.blocks.filter((block) => block.kind === 'tool').map((block) => block.callId)).toEqual([
      'call-1',
      'call-2',
    ])
  })

  function withCallEvents(createAt: number) {
    return [
      event({ type: 'user_message', message: userMessage }),
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: createAt }),
      event({ type: 'assistant_text_delta', messageId: 'a1', delta: 'Reading it.', at: 30 }),
      event({ type: 'assistant_message_finished', messageId: 'a1', interrupted: false }),
      started,
    ]
  }

  function toolBlock(state: ReturnType<typeof reduce>) {
    const assistant = state.messages.find((message) => message.role === 'assistant')
    const block = assistant?.blocks.find((candidate) => candidate.kind === 'tool')
    return block?.kind === 'tool' ? block : undefined
  }
})

describe('the approval gate', () => {
  const request = {
    requestId: 'req-1',
    callId: 'call-9',
    toolName: 'bash',
    risk: 'execute' as const,
    summary: 'rm -rf build',
    raw: '{"command":"rm -rf build"}',
    cwd: '/dev/alpha',
    level: 'ask' as const,
    requestedAt: 50,
  }

  it('holds a pending request until it is answered', () => {
    const state = reduce([event({ type: 'approval_requested', request })])
    expect(state.approvals).toEqual([request])
  })

  it('drops the request once the user answers', () => {
    const state = reduce([
      event({ type: 'approval_requested', request }),
      event({ type: 'approval_decided', requestId: 'req-1', callId: 'call-9', decision: 'once' }),
    ])
    expect(state.approvals).toEqual([])
  })

  it('ignores an answer for a request it is not showing', () => {
    const state = reduce([event({ type: 'approval_decided', requestId: 'stranger', callId: 'x', decision: 'deny' })])
    expect(state.approvals).toEqual([])
  })

  it('records on the row how the call got past the gate', () => {
    const state = reduce([
      ...withAssistant(),
      event({
        type: 'tool_started',
        callId: 'call-9',
        name: 'bash',
        risk: 'execute',
        summary: 'rm -rf build',
        raw: '{}',
        approval: { kind: 'once', level: 'ask' },
        startedAt: 51,
      }),
    ])
    expect(rowOf(state)).toMatchObject({ approval: { kind: 'once', level: 'ask' } })
  })

  it('records a denial on the row, with the reason the user gave', () => {
    const state = reduce([
      ...withAssistant(),
      event({
        type: 'tool_started',
        callId: 'call-9',
        name: 'bash',
        risk: 'execute',
        summary: 'rm -rf build',
        raw: '{}',
        approval: { kind: 'denied', level: 'ask', reason: 'that deletes the build cache' },
        startedAt: 51,
      }),
      event({ type: 'tool_finished', callId: 'call-9', status: 'failed', output: 'Denied.', endedAt: 52 }),
    ])
    expect(rowOf(state)).toMatchObject({
      status: 'failed',
      approval: { kind: 'denied', reason: 'that deletes the build cache' },
    })
  })

  it('does not leave a request behind when the run fails', () => {
    const state = reduce([
      event({ type: 'approval_requested', request }),
      event({ type: 'run_failed', message: 'the provider hung up' }),
    ])
    expect(state.approvals).toEqual([])
  })

  it('does not leave a request behind when the turn ends', () => {
    const state = reduce([event({ type: 'approval_requested', request }), event({ type: 'turn_finished' })])
    expect(state.approvals).toEqual([])
  })

  function withAssistant() {
    return [
      event({ type: 'user_message', message: userMessage }),
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_message_finished', messageId: 'a1', interrupted: false }),
    ]
  }

  function rowOf(state: ReturnType<typeof reduce>) {
    const block = state.messages.flatMap((message) => message.blocks).find((candidate) => candidate.kind === 'tool')
    return block?.kind === 'tool' ? block : undefined
  }
})
