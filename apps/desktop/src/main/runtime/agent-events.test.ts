import type { RuntimeEvent, UsageTotals } from '@alpha/domain'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, Usage, UserMessage } from '@earendil-works/pi-ai'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { AgentEventTranslator, failureOfRun } from './agent-events.ts'

const usage = (input: number, output: number): Usage => ({
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input + output,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: input / 1000 },
})

const assistant = (
  stopReason: AssistantMessage['stopReason'] = 'stop',
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage => ({
  role: 'assistant',
  content: [],
  api: 'openai-completions',
  provider: 'p',
  model: 'm',
  usage: usage(0, 0),
  stopReason,
  timestamp: 7,
  ...overrides,
})

const user = (text: string): UserMessage => ({
  role: 'user',
  content: [{ type: 'text', text }],
  timestamp: 7,
})

const messageUpdate = (kind: 'text_delta' | 'thinking_delta', delta: string, totals = usage(0, 0)): AgentEvent => {
  const message = assistant('pending', { usage: totals })
  return {
    type: 'message_update',
    message,
    assistantMessageEvent:
      kind === 'text_delta'
        ? { type: 'text_delta', contentIndex: 0, delta, partial: message }
        : { type: 'thinking_delta', contentIndex: 0, delta, partial: message },
  }
}

type TranslationEvent = AgentEvent | { type: 'agent_settled' }

const translate = (events: TranslationEvent[], translator = new AgentEventTranslator('c1')): RuntimeEvent[] =>
  events.flatMap((event) => translator.translate(event))

const kinds = (events: RuntimeEvent[]): string[] => events.map((event) => event.type)

describe("[runtime] the agent's events, in the workbench's terms", () => {
  it("accepts only embedded-agent events and Alpha's settle signal", () => {
    expectTypeOf<Parameters<AgentEventTranslator['translate']>[0]>().toEqualTypeOf<TranslationEvent>()
  })

  it('makes a run one turn, however many model calls it contains', () => {
    const events = translate([
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'turn_end', message: assistant(), toolResults: [] },
      { type: 'agent_end', messages: [assistant()] },
      { type: 'agent_settled' },
    ])

    expect(kinds(events)).toEqual(['turn_started', 'turn_finished'])
  })

  it('shows a user message when the agent takes it', () => {
    const events = translate([
      { type: 'agent_start' },
      { type: 'message_start', message: user('actually, this instead') },
      { type: 'message_end', message: user('actually, this instead') },
      { type: 'message_start', message: assistant('pending') },
    ])

    expect(kinds(events)).toEqual(['turn_started', 'user_message', 'assistant_message_started'])
    expect(events[1]).toMatchObject({
      type: 'user_message',
      message: { role: 'user', blocks: [{ kind: 'text', text: 'actually, this instead' }], createdAt: 7 },
    })
  })

  it('opens and closes an assistant message around text and thinking deltas', () => {
    const events = translate([
      { type: 'message_start', message: assistant('pending') },
      messageUpdate('text_delta', 'Hel'),
      messageUpdate('text_delta', 'lo'),
      messageUpdate('thinking_delta', 'hmm'),
      { type: 'message_end', message: assistant() },
    ])

    expect(kinds(events)).toEqual([
      'assistant_message_started',
      'assistant_text_delta',
      'assistant_text_delta',
      'assistant_thinking_delta',
      'assistant_message_finished',
    ])
    expect(events.filter((event) => event.type === 'assistant_text_delta').map((event) => event.delta)).toEqual([
      'Hel',
      'lo',
    ])
  })

  it('marks an aborted assistant message interrupted', () => {
    const translator = new AgentEventTranslator('c1')
    translate([{ type: 'message_start', message: assistant('pending') }], translator)
    expect(translate([{ type: 'message_end', message: assistant('aborted') }], translator)).toEqual([
      { conversationId: 'c1', type: 'assistant_message_finished', messageId: expect.any(String), interrupted: true },
    ])
  })

  it('reports only the usage added by each cumulative report', () => {
    const translator = new AgentEventTranslator('c1')
    translate([{ type: 'message_start', message: assistant('pending') }], translator)
    const totals = (events: RuntimeEvent[]): UsageTotals => {
      const event = events.find((item) => item.type === 'usage_recorded')
      if (event?.type !== 'usage_recorded') throw new Error('missing usage report')
      return event.usage
    }
    const first = translate([messageUpdate('text_delta', 'x', usage(100, 10))], translator)
    const second = translate([messageUpdate('text_delta', 'y', usage(150, 40))], translator)
    const duplicate = translate([messageUpdate('text_delta', 'z', usage(150, 40))], translator)
    const ended = translate(
      [{ type: 'message_end', message: assistant('stop', { usage: usage(170, 50) }) }],
      translator,
    )

    expect(totals(first)).toMatchObject({ input: 100, output: 10, totalTokens: 110 })
    expect(totals(second)).toMatchObject({ input: 50, output: 30, totalTokens: 80 })
    expect(duplicate.filter((event) => event.type === 'usage_recorded')).toEqual([])
    expect(totals(ended)).toMatchObject({ input: 20, output: 10, totalTokens: 30 })
  })

  it('shows a tool call, its output, and its final status', () => {
    const events = translate([
      { type: 'tool_execution_start', toolCallId: 'call_1', toolName: 'bash', args: { command: 'ls' } },
      {
        type: 'tool_execution_update',
        toolCallId: 'call_1',
        toolName: 'bash',
        args: { command: 'ls' },
        partialResult: { content: [{ type: 'text', text: 'half' }] },
      },
      {
        type: 'tool_execution_end',
        toolCallId: 'call_1',
        toolName: 'bash',
        result: { content: [{ type: 'text', text: 'done' }], details: { exitCode: 0 } },
        isError: false,
      },
    ])

    expect(kinds(events)).toEqual(['tool_started', 'tool_output', 'tool_finished'])
    expect(events[0]).toMatchObject({ type: 'tool_started', callId: 'call_1', name: 'bash' })
    expect(events[1]).toMatchObject({ type: 'tool_output', output: 'half' })
    expect(events[2]).toMatchObject({ type: 'tool_finished', status: 'ok', output: 'done' })
    expect(
      translate([{ type: 'tool_execution_end', toolCallId: 'call_2', toolName: 'bash', result: {}, isError: true }]),
    ).toMatchObject([{ type: 'tool_finished', status: 'failed' }])
  })

  it('ignores the model-call boundary events that the window does not draw', () => {
    expect(translate([{ type: 'turn_start' }, { type: 'turn_end', message: assistant(), toolResults: [] }])).toEqual([])
  })

  it('reports a final failure, including one with no message', () => {
    const failed = assistant('error', { errorMessage: 'the provider hung up' })
    expect(failureOfRun({ type: 'agent_end', messages: [failed] })).toEqual({
      message: 'the provider hung up',
      retryable: false,
    })
    expect(kinds(translate([{ type: 'agent_start' }, { type: 'agent_end', messages: [failed] }]))).toEqual([
      'turn_started',
      'run_failed',
    ])
    expect(translate([{ type: 'agent_start' }, { type: 'agent_end', messages: [assistant('error')] }])[1]).toEqual({
      conversationId: 'c1',
      type: 'run_failed',
    })
    expect(failureOfRun({ type: 'agent_end', messages: [] })).toBeUndefined()
    expect(failureOfRun({ type: 'message_end', message: failed })).toBeUndefined()
  })

  it('keeps the turn open while retrying and closes it when the retry budget is spent', () => {
    const failure = assistant('error', { errorMessage: 'overloaded' })
    const retrying = translate(
      [
        { type: 'agent_start' },
        { type: 'agent_end', messages: [failure] },
        { type: 'agent_start' },
        { type: 'agent_end', messages: [assistant()] },
      ],
      new AgentEventTranslator('c1', { shouldRetry: () => true }),
    )
    expect(kinds(retrying)).toEqual(['turn_started', 'turn_finished'])

    const exhausted = translate(
      [{ type: 'agent_start' }, { type: 'agent_end', messages: [failure] }],
      new AgentEventTranslator('c1', { shouldRetry: () => false }),
    )
    expect(kinds(exhausted)).toEqual(['turn_started', 'run_failed'])
  })
})
