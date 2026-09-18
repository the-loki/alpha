import type { RuntimeEvent } from '@alpha/core'
import type { HarnessEvent } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'
import { createEventTranslator } from './translate.ts'

/**
 * The harness events below are assembled by hand with only the fields the translator reads,
 * which keeps this unit test a test of the mapping rather than of pi's message construction.
 */
const asHarnessEvent = (value: unknown): HarnessEvent => value as HarnessEvent

const userMessage = (text: string) =>
  asHarnessEvent({ type: 'message_start', runId: 'r1', message: { role: 'user', content: text, timestamp: 10 } })

const assistantStart = (timestamp = 20) =>
  asHarnessEvent({ type: 'message_start', runId: 'r1', message: { role: 'assistant', content: [], timestamp } })

const textDelta = (delta: string) =>
  asHarnessEvent({
    type: 'message_update',
    runId: 'r1',
    message: { role: 'assistant', content: [], timestamp: 20 },
    event: { type: 'text_delta', contentIndex: 0, delta, partial: { role: 'assistant', content: [] } },
  })

const thinkingDelta = (delta: string) =>
  asHarnessEvent({
    type: 'message_update',
    runId: 'r1',
    message: { role: 'assistant', content: [], timestamp: 20 },
    event: { type: 'thinking_delta', contentIndex: 0, delta, partial: { role: 'assistant', content: [] } },
  })

const assistantEnd = (stopReason = 'stop') =>
  asHarnessEvent({
    type: 'message_end',
    runId: 'r1',
    message: { role: 'assistant', content: [], timestamp: 20, stopReason },
    entryId: 'e1',
  })

const turnStart = () => asHarnessEvent({ type: 'turn_start', runId: 'r1', turnId: 't1' })
const runEnd = (status = 'completed') =>
  asHarnessEvent(
    status === 'completed'
      ? { type: 'run_end', runId: 'r1', fromTipId: null, tipId: 'e1', endedAt: 30, status: 'completed' }
      : {
          type: 'run_end',
          runId: 'r1',
          fromTipId: null,
          tipId: 'e1',
          endedAt: 30,
          status: 'failed',
          error: { message: 'boom' },
        },
  )

const translateAll = (events: unknown[]) => {
  const translator = createEventTranslator('c1')
  return events.flatMap((event) => translator.translate(asHarnessEvent(event)))
}

/** Picks one event out of a translation by kind, with its payload typed. */
const pick = <TType extends RuntimeEvent['type']>(events: RuntimeEvent[], type: TType) =>
  events.find((event) => event.type === type) as Extract<RuntimeEvent, { type: TType }> | undefined

describe('[runtime] createEventTranslator', () => {
  it('reports the start of a turn', () => {
    expect(translateAll([turnStart()])).toEqual([{ conversationId: 'c1', type: 'turn_started' }])
  })

  it('turns a user message into one the window can render', () => {
    const translated = pick(translateAll([userMessage('hello there')]), 'user_message')
    expect(translated?.message).toMatchObject({
      role: 'user',
      blocks: [{ kind: 'text', text: 'hello there' }],
      status: 'complete',
    })
  })

  it('flattens a user message that arrives as content parts', () => {
    const parts = asHarnessEvent({
      type: 'message_start',
      runId: 'r1',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
        timestamp: 10,
      },
    })
    const translated = pick(translateAll([parts]), 'user_message')
    expect(translated?.message.blocks).toEqual([{ kind: 'text', text: 'a\nb' }])
  })

  it('names the assistant message that starts streaming, and reuses that name for its deltas', () => {
    const translated = translateAll([assistantStart(), textDelta('Hel'), textDelta('lo')])
    const started = pick(translated, 'assistant_message_started')
    const deltas = translated.filter((event) => event.type === 'assistant_text_delta')
    expect(started).toBeDefined()
    expect(deltas.map((event) => event.delta)).toEqual(['Hel', 'lo'])
    expect(deltas.every((event) => event.messageId === started?.messageId)).toBe(true)
  })

  it('carries thinking deltas as thinking, not text', () => {
    const translated = translateAll([assistantStart(), thinkingDelta('weighing')])
    expect(pick(translated, 'assistant_thinking_delta')?.messageId).toBe(
      pick(translated, 'assistant_message_started')?.messageId,
    )
  })

  it('finishes the message with the name it was started under', () => {
    const translated = translateAll([assistantStart(), assistantEnd()])
    expect(pick(translated, 'assistant_message_finished')).toMatchObject({
      messageId: pick(translated, 'assistant_message_started')?.messageId,
      interrupted: false,
    })
  })

  it('calls a message that stopped because it was aborted interrupted', () => {
    expect(pick(translateAll([assistantStart(), assistantEnd('aborted')]), 'assistant_message_finished')).toMatchObject(
      {
        interrupted: true,
      },
    )
  })

  it('reports a failed run with the error the runtime gave', () => {
    expect(translateAll([turnStart(), runEnd('failed')])).toContainEqual({
      conversationId: 'c1',
      type: 'run_failed',
      message: 'boom',
    })
  })

  it('reports a completed run as the end of the turn', () => {
    expect(translateAll([turnStart(), runEnd('completed')])).toContainEqual({
      conversationId: 'c1',
      type: 'turn_finished',
    })
  })

  it('ignores a delta that arrives with no message open', () => {
    expect(translateAll([textDelta('stray')])).toEqual([])
  })

  it('ignores events it has no use for', () => {
    expect(
      translateAll([
        { type: 'entry_added', entry: {} },
        { type: 'value_update', value: 'session_name' },
      ]),
    ).toEqual([])
  })

  it('reports what a call spent, in the workbench vocabulary', () => {
    const translated = translateAll([
      asHarnessEvent({
        type: 'usage',
        lane: 'main',
        row: {
          id: 'u1',
          seq: 1,
          adjustment: false,
          usage: {
            input: 1200,
            output: 300,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 1500,
            cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
          },
        },
        totals: {},
      }),
    ])

    expect(translated).toEqual([
      {
        conversationId: 'c1',
        type: 'usage_recorded',
        usage: {
          input: 1200,
          output: 300,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 1500,
          cost: 0.003,
        },
      },
    ])
  })

  it('stamps a row with the decision the gate made for that call', () => {
    const translator = createEventTranslator('c1', (callId) =>
      callId === 'call-1' ? { kind: 'once', level: 'ask' } : undefined,
    )
    const started = translator.translate(
      asHarnessEvent({
        type: 'tool_start',
        runId: 'r1',
        turnId: 't1',
        toolCallId: 'call-1',
        toolName: 'bash',
        args: { command: 'ls' },
      }),
    )

    expect(started[0]).toMatchObject({ type: 'tool_started', callId: 'call-1', approval: { kind: 'once' } })
  })

  it('leaves the row unstamped when the gate recorded nothing', () => {
    const translator = createEventTranslator('c1')
    const started = translator.translate(
      asHarnessEvent({
        type: 'tool_start',
        runId: 'r1',
        turnId: 't1',
        toolCallId: 'call-2',
        toolName: 'read',
        args: { path: 'a' },
      }),
    )

    expect(started[0]?.type === 'tool_started' && started[0].approval).toBeUndefined()
  })

  it('gives consecutive assistant messages distinct names', () => {
    const translated = translateAll([assistantStart(), assistantEnd(), assistantStart(), assistantEnd()])
    const ids = translated.filter((event) => event.type === 'assistant_message_started').map((event) => event.messageId)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })
})
