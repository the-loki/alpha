import type { RuntimeEvent, UsageTotals } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
import { AgentEventTranslator, failedMessageOf, type RpcLikeEvent } from './agent-events.ts'

const usage = (input: number, output: number): Record<string, unknown> => ({
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: input + output,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: input / 1000 },
})

const translate = (events: RpcLikeEvent[], translator = new AgentEventTranslator('c1')): RuntimeEvent[] =>
  events.flatMap((event) => translator.translate(event))

const kinds = (events: RuntimeEvent[]): string[] => events.map((event) => event.type)

describe("[runtime] the agent's events, in the workbench's terms", () => {
  it('makes a run one turn, whatever pi calls its own turns', () => {
    const events = translate([
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'turn_end' },
      { type: 'agent_end' },
      { type: 'agent_settled' },
    ])

    // pi's turn is one model call; Alpha's is the run: the composer follows the run.
    expect(kinds(events)).toEqual(['turn_started', 'turn_finished'])
  })

  it('says a user message when the run takes it, which a steered one arrives as', () => {
    const events = translate([
      { type: 'agent_start' },
      { type: 'turn_start' },
      {
        type: 'message_start',
        message: { role: 'user', content: [{ type: 'text', text: 'actually, this instead' }], timestamp: 7 },
      },
      { type: 'message_end', message: { role: 'user' } },
      { type: 'message_start', message: { role: 'assistant' } },
    ])

    // pi records the person's message as a message like any other, and it is the only signal that
    // says when the lane took a steering message: nothing else is emitted at that moment.
    expect(kinds(events)).toEqual(['turn_started', 'user_message', 'assistant_message_started'])
    const said = events[1]
    expect(said?.type === 'user_message' ? said.message.blocks : []).toEqual([
      { kind: 'text', text: 'actually, this instead' },
    ])
    expect(said?.type === 'user_message' ? said.message.createdAt : 0).toBe(7)
    expect(said?.type === 'user_message' ? said.message.role : '').toBe('user')
  })

  it('opens and closes a message around its deltas, text and thinking alike', () => {
    const events = translate([
      { type: 'message_start', message: { role: 'assistant' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hel' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'lo' } },
      { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'hmm' } },
      { type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } },
    ])

    expect(kinds(events)).toEqual([
      'assistant_message_started',
      'assistant_text_delta',
      'assistant_text_delta',
      'assistant_thinking_delta',
      'assistant_message_finished',
    ])
    const deltas = events.filter((event) => event.type === 'assistant_text_delta')
    expect(deltas.map((event) => (event.type === 'assistant_text_delta' ? event.delta : ''))).toEqual(['Hel', 'lo'])
  })

  it('marks the message interrupted when the run was stopped', () => {
    const translator = new AgentEventTranslator('c1')
    translate([{ type: 'message_start', message: { role: 'assistant' } }], translator)
    const events = translate(
      [{ type: 'message_end', message: { role: 'assistant', stopReason: 'aborted' } }],
      translator,
    )

    expect(events).toEqual([
      { conversationId: 'c1', type: 'assistant_message_finished', messageId: expect.any(String), interrupted: true },
    ])
  })

  it('reports usage as what it added, because pi reports it cumulatively', () => {
    // The window's total is a sum of what it is told: sending the cumulative figure again would
    // count the same tokens twice. pi reports it on the message it is streaming.
    const translator = new AgentEventTranslator('c1')
    const streamed = (totals: Record<string, unknown>): RpcLikeEvent => ({
      type: 'message_update',
      message: { role: 'assistant', usage: totals },
      assistantMessageEvent: { type: 'text_delta', delta: 'x' },
    })
    const first = translate([streamed(usage(100, 10))], translator)
    const second = translate([streamed(usage(150, 40))], translator)
    const third = translate([streamed(usage(150, 40))], translator)

    const totals = (events: RuntimeEvent[]): UsageTotals =>
      (events.find((event) => event.type === 'usage_recorded') as { usage: UsageTotals }).usage
    expect(totals(first)).toMatchObject({ input: 100, output: 10, totalTokens: 110 })
    expect(totals(second)).toMatchObject({ input: 50, output: 30, totalTokens: 80 })
    // Nothing new is nothing to say.
    expect(third.filter((event) => event.type === 'usage_recorded')).toEqual([])
  })

  it('turns a tool call into the row the ledger draws, with its output as it arrives', () => {
    const events = translate([
      { type: 'tool_execution_start', toolCallId: 'call_1', toolName: 'bash', args: { command: 'ls' } },
      {
        type: 'tool_execution_update',
        toolCallId: 'call_1',
        toolName: 'bash',
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
    expect(events[1]).toMatchObject({ type: 'tool_output', callId: 'call_1', output: 'half' })
    expect(events[2]).toMatchObject({ type: 'tool_finished', callId: 'call_1', status: 'ok', output: 'done' })
  })

  it('says a failed tool call failed', () => {
    const events = translate([
      { type: 'tool_execution_start', toolCallId: 'call_9', toolName: 'bash', args: { command: 'rm -rf /' } },
      { type: 'tool_execution_end', toolCallId: 'call_9', toolName: 'bash', result: {}, isError: true },
    ])

    // How the call got past the gate is not this module's business: the agent announces a call
    // before Alpha has decided, so the decision arrives as its own event (runtime/tool_decided).
    expect(events[0]).toEqual({
      conversationId: 'c1',
      type: 'tool_started',
      callId: 'call_9',
      name: 'bash',
      args: { command: 'rm -rf /' },
      startedAt: expect.any(Number),
    })
    expect(events[1]).toMatchObject({ type: 'tool_finished', status: 'failed' })
  })

  it('says what a compaction stood in for, as far as pi reports it', () => {
    const events = translate([
      {
        type: 'compaction_end',
        reason: 'threshold',
        result: { summary: 'Earlier turns were about naming things.', tokensBefore: 150000 },
        aborted: false,
      },
    ])

    expect(events[0]).toMatchObject({ type: 'history_compacted', summary: 'Earlier turns were about naming things.' })
  })

  it('ignores the events that are about nothing the window draws', () => {
    const events = translate([
      { type: 'text_start' },
      { type: 'compaction_start', reason: 'threshold' },
      { type: 'auto_retry_start' },
      { type: 'bash_execution_update', delta: 'x' },
      { type: 'extension_ui_request', method: 'confirm' },
    ])

    expect(events).toEqual([])
  })

  it('says a run failed when the message that ended it says so', () => {
    // pi has no failure event: the run ends with an assistant message that failed.
    const events = translate([
      { type: 'agent_start' },
      {
        type: 'agent_end',
        messages: [{ role: 'assistant', stopReason: 'error', errorMessage: 'the provider hung up' }],
      },
    ])

    expect(kinds(events)).toEqual(['turn_started', 'run_failed'])
    expect(events[1]).toMatchObject({ type: 'run_failed', message: 'the provider hung up' })
  })

  it('reads the failure off an agent_end alone, and only when its last message erred', () => {
    // The one decoder: the translator says `run_failed` with it, and the retry policy is asked
    // about exactly what it read.
    const failed = { role: 'assistant', stopReason: 'error', errorMessage: 'the provider hung up' }
    expect(failedMessageOf({ type: 'agent_end', messages: [failed] })).toBe('the provider hung up')
    expect(failedMessageOf({ type: 'agent_end', messages: [] })).toBeUndefined()
    expect(failedMessageOf({ type: 'message_end', message: failed })).toBeUndefined()
  })

  it('keeps the run open while the retry policy is going to try again', () => {
    const events = translate(
      [
        { type: 'agent_start' },
        {
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'error', errorMessage: 'overloaded' }],
        },
        { type: 'agent_start' },
        { type: 'agent_end', messages: [{ role: 'assistant', stopReason: 'stop' }] },
      ],
      new AgentEventTranslator('c1', { shouldRetry: () => true }),
    )

    expect(kinds(events)).toEqual(['turn_started', 'turn_finished'])
  })

  it('closes the run as the failure when the retry policy has had enough', () => {
    const events = translate(
      [
        { type: 'agent_start' },
        {
          type: 'agent_end',
          messages: [{ role: 'assistant', stopReason: 'error', errorMessage: 'overloaded' }],
        },
      ],
      new AgentEventTranslator('c1', { shouldRetry: () => false }),
    )

    expect(kinds(events)).toEqual(['turn_started', 'run_failed'])
  })

  it('does not call an ordinary answer with no error field a failure', () => {
    const events = translate([
      { type: 'agent_start' },
      { type: 'agent_end', messages: [{ role: 'assistant', stopReason: 'stop' }] },
    ])

    expect(kinds(events)).toEqual(['turn_started', 'turn_finished'])
  })
})
