import { describe, expect, it } from 'vitest'
import type { ChatMessage, ConversationSummary, RuntimeEvent } from './runtime-events.ts'
import {
  emptyTranscript,
  openingTranscript,
  reduceTranscript,
  streamingMessage,
  totalUsage,
  visibleMessages,
} from './transcript.ts'
import { EMPTY_USAGE } from './usage.ts'

const CONVERSATION = 'c1'

const summary: ConversationSummary = {
  id: CONVERSATION,
  workspacePath: '/dev/alpha',
  title: 'New conversation',
  createdAt: 1,
  updatedAt: 1,
  status: 'running',
  permissionLevel: 'ask',
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

describe('[domain] emptyTranscript', () => {
  it('starts idle, empty, with nothing streaming', () => {
    const state = emptyTranscript(CONVERSATION)
    expect(state.messages).toEqual([])
    expect(state.streaming).toBeUndefined()
    expect(state.status).toBe('idle')
  })
})

describe('[domain] reduceTranscript', () => {
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

  it('removes only the assistant message whose failed attempt was retried', () => {
    const state = reduce([
      event({ type: 'turn_started' }),
      event({ type: 'assistant_message_started', messageId: 'failed', createdAt: 20 }),
      event({ type: 'assistant_text_delta', messageId: 'failed', delta: 'discarded', at: 30 }),
      event({ type: 'assistant_message_finished', messageId: 'failed', interrupted: false }),
      event({ type: 'assistant_message_started', messageId: 'kept', createdAt: 40 }),
      event({ type: 'assistant_text_delta', messageId: 'kept', delta: 'answer', at: 50 }),
      event({ type: 'assistant_message_finished', messageId: 'kept', interrupted: false }),
      event({ type: 'assistant_message_discarded', messageId: 'failed' }),
    ])

    expect(state.messages.map((message) => message.id)).toEqual(['kept'])
    expect(state.status).toBe('running')
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
    expect(state.messages[0].failure).toEqual({ said: 'the provider refused the key' })
    expect(state.messages[0].blocks).toEqual([{ kind: 'text', text: 'partial' }])
    expect(state.messages[0].status).toBe('failed')
  })

  it('records a failure that said nothing as a row with no sentence of its own', () => {
    const state = reduce([event({ type: 'turn_started' }), event({ type: 'run_failed' })])

    expect(state.status).toBe('failed')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({ role: 'assistant', status: 'failed' })
    // What the row says then is the window's own sentence, in the language the window is in
    // (ADR-0010). A sentence invented here would arrive in English whatever language that is.
    expect(state.messages[0].failure).toBeUndefined()
  })

  it('records a refusal as a row carrying the case, with no sentence of its own', () => {
    // A turn that never started says which refusal stopped it and nothing more: the words for a
    // case are the window's, in the window's language (ADR-0010). A sentence written here would
    // arrive in English whatever language the window is in, which is what this replaced.
    const state = reduce([event({ type: 'turn_refused', refusal: { kind: 'no-model' } })])

    expect(state.status).toBe('failed')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({
      role: 'assistant',
      status: 'failed',
      failure: { refusal: { kind: 'no-model' } },
    })
  })

  it('keeps the names a refusal names, so the sentence can name them too', () => {
    const state = reduce([
      event({ type: 'turn_refused', refusal: { kind: 'model-not-served', providerId: 'local', modelId: 'ghost' } }),
    ])

    expect(state.messages[0].failure).toEqual({
      refusal: { kind: 'model-not-served', providerId: 'local', modelId: 'ghost' },
    })
  })

  it('records a failure as its own message when nothing was streamed', () => {
    const state = reduce([
      event({ type: 'turn_started' }),
      event({ type: 'run_failed', message: 'the provider refused the key' }),
    ])
    expect(state.status).toBe('failed')
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({
      role: 'assistant',
      status: 'failed',
      failure: { said: 'the provider refused the key' },
    })
  })

  it('keeps no empty answer where nothing was answered', () => {
    const state = reduce([
      event({ type: 'assistant_message_started', messageId: 'a1', createdAt: 20 }),
      event({ type: 'assistant_message_finished', messageId: 'a1', interrupted: false }),
    ])
    expect(state.messages).toEqual([])
  })

  it('replaces everything when the conversation is opened', () => {
    const opened = reduce([
      event({ type: 'assistant_message_started', messageId: 'stale', createdAt: 5 }),
      event({
        type: 'conversation_opened',
        conversation: summary,
        messages: [userMessage],
        usage: EMPTY_USAGE,
        workspaceChanges: [],
      }),
    ])
    expect(opened.messages).toEqual([userMessage])
    expect(opened.streaming).toBeUndefined()
    expect(opened.status).toBe('idle')
  })

  it('carries the summary that arrived with the opened conversation', () => {
    const opened = reduce([
      event({
        type: 'conversation_opened',
        conversation: summary,
        messages: [],
        usage: EMPTY_USAGE,
        workspaceChanges: [],
      }),
    ])
    expect(opened.summary).toEqual(summary)
  })

  it('restores workspace reviews and prepends a finished run without changing messages', () => {
    const earlier = { id: 'r1', startedAt: 10, endedAt: 20, recovered: false, incomplete: false, files: [] }
    const latest = {
      id: 'r2',
      startedAt: 30,
      endedAt: 40,
      recovered: false,
      incomplete: false,
      files: [{ path: 'source.ts', kind: 'added' as const, afterText: 'new' }],
    }
    const state = reduce([
      event({
        type: 'conversation_opened',
        conversation: summary,
        messages: [userMessage],
        usage: EMPTY_USAGE,
        workspaceChanges: [earlier],
      }),
      event({ type: 'workspace_changes_recorded', changeSet: latest }),
    ])

    expect(state.workspaceChanges).toEqual([latest, earlier])
    expect(state.messages).toEqual([userMessage])
  })

  it('ignores events addressed to a different conversation', () => {
    const state = reduce([{ conversationId: 'other', type: 'user_message', message: userMessage }])
    expect(state.messages).toEqual([])
  })
})

describe('[domain] streaming discipline', () => {
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

describe('[domain] visibleMessages', () => {
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

describe('[domain] the tool ledger', () => {
  const callId = 'call-1'

  const started = event({
    type: 'tool_started',
    callId,
    name: 'read',
    args: { path: 'src/index.ts' },
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
        args: { command: 'ls' },
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

describe('[domain] the approval gate', () => {
  const request = {
    requestId: 'req-1',
    callId: 'call-9',
    toolName: 'bash',
    risk: 'execute' as const,
    summary: 'rm -rf build',
    detail: 'rm -rf build',
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
        args: { command: 'rm -rf build' },
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
        args: { command: 'rm -rf build' },
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

describe('[domain] usage', () => {
  it('keeps the spending of a failed turn in the visible total', () => {
    const spent = { input: 900, output: 100, cacheRead: 0, cacheWrite: 0, totalTokens: 1000, cost: 0.01 }
    const state = reduce([
      event({ type: 'turn_started' }),
      event({ type: 'usage_recorded', usage: spent }),
      event({ type: 'run_failed', message: 'provider failed' }),
    ])

    expect(state.status).toBe('failed')
    expect(state.turns).toEqual([{ usage: spent }])
    expect(totalUsage(state)).toEqual(spent)
  })

  it('counts history and the next turn once each', () => {
    // What a relaunch is: a conversation that already spent something opens again, and the turn
    // that follows must not carry the history into its own row.
    const history = { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 4000, cost: 0 }
    const turn = { input: 250, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 1000, cost: 0 }
    const opened = openingTranscript(CONVERSATION, summary, [], history)
    const after = reduceTranscript(
      reduceTranscript(opened, { conversationId: 'c1', type: 'usage_recorded', usage: turn }),
      { conversationId: 'c1', type: 'turn_finished' },
    )

    expect(after.turns.map((row) => row.usage.totalTokens)).toEqual([4000, 1000])
    expect(totalUsage(after).totalTokens).toBe(5000)
  })

  const spending = (totalTokens: number, cost = 0) => ({
    input: totalTokens - 100,
    output: 100,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens,
    cost,
  })

  it('adds what arrives to the session total', () => {
    const state = reduce([
      event({ type: 'turn_started' }),
      event({ type: 'usage_recorded', usage: spending(1000) }),
      event({ type: 'usage_recorded', usage: spending(500) }),
      event({ type: 'turn_finished' }),
    ])

    expect(totalUsage(state).totalTokens).toBe(1500)
  })

  it('counts what is being spent now, without moving the header before the turn lands', () => {
    const state = reduce([event({ type: 'turn_started' }), event({ type: 'usage_recorded', usage: spending(1000) })])

    expect(state.turnUsage.totalTokens).toBe(1000)
    expect(state.turns).toEqual([])
    expect(totalUsage(state).totalTokens).toBe(0)
  })

  it('attributes what was spent to the turn that spent it', () => {
    const state = reduce([
      event({ type: 'turn_started' }),
      event({ type: 'usage_recorded', usage: spending(1000, 0.01) }),
      event({ type: 'turn_finished' }),
      event({ type: 'turn_started' }),
      event({ type: 'usage_recorded', usage: spending(300, 0.002) }),
      event({ type: 'turn_finished' }),
    ])

    expect(state.turns.map((turn) => turn.usage.totalTokens)).toEqual([1000, 300])
    expect(totalUsage(state).cost).toBeCloseTo(0.012)
  })

  it('does not compound when a relaunch follows a relaunch', () => {
    // The failure this guards is the one that only showed up on the second open: each relaunch
    // reads the running total back as history, and the turn after it must still count once.
    const first = openingTranscript(CONVERSATION, summary, [], spending(4000))
    const afterFirst = reduceTranscript(
      reduceTranscript(first, event({ type: 'usage_recorded', usage: spending(1000) })),
      event({ type: 'turn_finished' }),
    )
    const second = openingTranscript(CONVERSATION, summary, [], totalUsage(afterFirst))
    const afterSecond = reduceTranscript(
      reduceTranscript(second, event({ type: 'usage_recorded', usage: spending(200) })),
      event({ type: 'turn_finished' }),
    )

    expect(afterSecond.turns.map((row) => row.usage.totalTokens)).toEqual([5000, 200])
    expect(totalUsage(afterSecond).totalTokens).toBe(5200)
  })

  it('records no empty row for a turn that spent nothing', () => {
    const state = reduce([
      event({ type: 'turn_started' }),
      event({ type: 'usage_recorded', usage: spending(700) }),
      event({ type: 'turn_finished' }),
      event({ type: 'turn_started' }),
      event({ type: 'turn_finished' }),
    ])

    expect(state.turns).toHaveLength(1)
  })

  it('carries the spending of earlier sessions in one row, so the sum still adds up', () => {
    const state = openingTranscript(CONVERSATION, summary, [], spending(4000, 0.04))
    expect(state.turns).toEqual([{ usage: spending(4000, 0.04), earlier: true }])
    expect(totalUsage(state)).toEqual(spending(4000, 0.04))
  })

  it('has nothing to carry when the conversation has never spent anything', () => {
    expect(openingTranscript(CONVERSATION, summary, [], spending(0)).turns).toEqual([])
  })

  it('survives being opened: the seeded spending is not wiped by the event that opens it', () => {
    const state = reduce([
      event({
        type: 'conversation_opened',
        conversation: summary,
        messages: [userMessage],
        usage: spending(2500, 0.02),
        workspaceChanges: [],
      }),
    ])

    expect(totalUsage(state).totalTokens).toBe(2500)
  })
})

describe('[domain] compaction', () => {
  it('marks where the history was summarised, and keeps the summary readable', () => {
    const state = reduce([
      event({ type: 'user_message', message: userMessage }),
      event({ type: 'history_compacted', summary: 'Earlier turns were about the parser.', replaced: 12, at: 60 }),
    ])

    const marker = state.messages.at(-1)
    expect(marker?.blocks).toEqual([
      { kind: 'compaction', summary: 'Earlier turns were about the parser.', replaced: 12 },
    ])
  })

  it('says nothing about a count the runtime did not give', () => {
    const state = reduce([event({ type: 'history_compacted', summary: 'Summarised.', at: 60 })])
    expect(state.messages.at(-1)?.blocks).toEqual([{ kind: 'compaction', summary: 'Summarised.', replaced: undefined }])
  })
})

describe('[domain] MCP requests in a conversation', () => {
  const request = {
    requestId: 'req-1',
    server: 'files',
    toolCallId: 'tool-1',
    toolName: 'mcp__files__lookup',
    requestedAt: 10,
    form: { message: 'Name?', fields: [{ name: 'name', title: 'Name', type: 'string' as const, required: true }] },
  }
  const pending = {
    id: 'req-1',
    server: 'files',
    method: 'elicitation/create' as const,
    toolCallId: 'tool-1',
    toolName: 'mcp__files__lookup',
    requestText: 'Name?',
    requestedAt: 10,
    outcome: 'pending' as const,
  }

  it('shows a live form and keeps its settled audit after the card leaves', () => {
    const opened = openingTranscript(CONVERSATION, summary, [], EMPTY_USAGE, [], [], [request])
    expect(opened.mcpPending).toEqual([request])
    const state = reduce([
      event({ type: 'mcp_elicitation_requested', request }),
      event({ type: 'mcp_exchange_recorded', exchange: pending }),
      event({
        type: 'mcp_exchange_recorded',
        exchange: { ...pending, outcome: 'accepted', content: { name: 'Ada' }, settledAt: 20 },
      }),
    ])
    expect(state.mcpPending).toEqual([])
    expect(state.mcpExchanges).toEqual([{ ...pending, outcome: 'accepted', content: { name: 'Ada' }, settledAt: 20 }])
  })

  it('does not put another conversation’s form in the open conversation', () => {
    const state = reduceTranscript(emptyTranscript(CONVERSATION), {
      conversationId: 'other',
      type: 'mcp_elicitation_requested',
      request,
    })
    expect(state.mcpPending).toEqual([])
  })

  it('replaces each sampling stage and counts use even when sharing is declined', () => {
    const sample = {
      requestId: 'sample-1',
      server: 'files',
      toolCallId: 'call-2',
      toolName: 'mcp__files__query',
      requestedAt: 20,
      stage: 'consent' as const,
      prompt: {
        messages: [{ role: 'user' as const, text: 'Question?' }],
        maxTokens: 100,
        requestedContext: false,
        hints: [],
      },
      model: { providerId: 'p', modelId: 'm', name: 'Model M', maxTokens: 100 },
    }
    const usage = { input: 11, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 16, cost: 0 }
    const record = { ...pending, id: 'sample-1', method: 'sampling/createMessage' as const, usage }
    const state = reduce([
      event({ type: 'mcp_sampling_requested', request: sample }),
      event({
        type: 'mcp_sampling_requested',
        request: { ...sample, stage: 'review', generated: { text: 'Answer', usage, stopReason: 'stop' } },
      }),
      event({ type: 'mcp_exchange_recorded', exchange: record }),
      event({ type: 'mcp_exchange_recorded', exchange: { ...record, outcome: 'declined' } }),
    ])
    expect(state.mcpSamplingPending).toEqual([])
    expect(state.mcpExchanges).toHaveLength(1)
    expect(totalUsage(state).totalTokens).toBe(16)
  })
})
