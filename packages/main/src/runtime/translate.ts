/**
 * Harness events in, runtime events out. The harness speaks in pi's vocabulary — lanes, runs,
 * turns, entries — and the window speaks in the workbench's (CONTEXT.md). This is the one place
 * the two meet, and it is a pure function over explicit state so the mapping is testable without
 * a model.
 *
 * The state is small: a counter for message names, and which assistant message is currently
 * streaming. The harness does not name a message when it starts one, so the name is minted here
 * and reused for every delta and for the finish.
 */

import { type ApprovalRecord, type RuntimeEvent, toolRiskOf } from '@alpha/core'
import type { HarnessEvent } from '@earendil-works/pi-agent-core'
import { outputTextOf, summarizeToolCall, toolDetails } from './tool-call.ts'

export interface EventTranslator {
  translate(event: HarnessEvent): RuntimeEvent[]
}

/** How a row learns why its call got past the gate. */
export type ApprovalLookup = (callId: string) => ApprovalRecord | undefined

interface TranslatorState {
  counter: number
  openAssistantId?: string
}

/** A user message's content is either a string or parts; the parts that are text are the message. */
type MessageContent = string | Array<{ type: string; text?: string }>

const textOf = (content: MessageContent): string => {
  if (typeof content === 'string') return content
  return content
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .filter((text) => text !== '')
    .join('\n')
}

export function createEventTranslator(
  conversationId: string,
  approvalOf: ApprovalLookup = () => undefined,
): EventTranslator {
  const state: TranslatorState = { counter: 0 }
  return { translate: (event) => translateEvent(state, conversationId, event, approvalOf) }
}

function translateEvent(
  state: TranslatorState,
  conversationId: string,
  event: HarnessEvent,
  approvalOf: ApprovalLookup,
): RuntimeEvent[] {
  switch (event.type) {
    case 'turn_start':
      return [{ conversationId, type: 'turn_started' }]

    case 'run_end':
      state.openAssistantId = undefined
      if (event.status === 'failed') {
        return [{ conversationId, type: 'run_failed', message: event.error.message }]
      }
      return [{ conversationId, type: 'turn_finished' }]

    case 'fault':
      state.openAssistantId = undefined
      return [{ conversationId, type: 'run_failed', message: event.message }]

    case 'message_start':
    case 'message_update':
    case 'message_end':
      return translateMessageEvent(state, conversationId, event)

    case 'tool_start':
      return [toolStarted(conversationId, event, approvalOf)]

    case 'tool_update':
      return [
        { conversationId, type: 'tool_output', callId: event.toolCallId, output: outputTextOf(event.partialResult) },
      ]

    case 'tool_end':
      return [toolFinished(conversationId, event)]

    default:
      return []
  }
}

/** A row is stamped with the gate's decision here, so the ledger can say why the call was allowed. */
function toolStarted(
  conversationId: string,
  event: Extract<HarnessEvent, { type: 'tool_start' }>,
  approvalOf: ApprovalLookup,
): RuntimeEvent {
  return {
    conversationId,
    type: 'tool_started',
    callId: event.toolCallId,
    name: event.toolName,
    risk: toolRiskOf(event.toolName),
    summary: summarizeToolCall(event.toolName, event.args),
    raw: JSON.stringify(event.args ?? {}),
    approval: approvalOf(event.toolCallId),
    startedAt: Date.now(),
  }
}

function toolFinished(conversationId: string, event: Extract<HarnessEvent, { type: 'tool_end' }>): RuntimeEvent {
  const output = outputTextOf(event.result)
  return {
    conversationId,
    type: 'tool_finished',
    callId: event.toolCallId,
    status: event.isError ? 'failed' : 'ok',
    output,
    details: toolDetails(event.toolName, event.result?.details, output),
    endedAt: Date.now(),
  }
}

function translateMessageEvent(state: TranslatorState, conversationId: string, event: HarnessEvent): RuntimeEvent[] {
  switch (event.type) {
    case 'message_start':
      return startMessage(state, conversationId, event.message)
    case 'message_update':
      return updateMessage(state, conversationId, event.event)
    case 'message_end':
      return endMessage(state, conversationId, event.message)
    default:
      return []
  }
}

type StartedMessage =
  | { role: 'user'; content: MessageContent; timestamp: number }
  | { role: 'assistant'; timestamp: number }
  | { role: string }

function startMessage(state: TranslatorState, conversationId: string, message: StartedMessage): RuntimeEvent[] {
  state.counter += 1
  const messageId = `m${state.counter}`

  if (message.role === 'user') {
    const content = 'content' in message ? message.content : ''
    const text = textOf(content)
    return [
      {
        conversationId,
        type: 'user_message',
        message: {
          id: messageId,
          role: 'user',
          blocks: text === '' ? [] : [{ kind: 'text', text }],
          createdAt: 'timestamp' in message ? message.timestamp : Date.now(),
          status: 'complete',
        },
      },
    ]
  }

  if (message.role === 'assistant') {
    state.openAssistantId = messageId
    return [
      {
        conversationId,
        type: 'assistant_message_started',
        messageId,
        createdAt: 'timestamp' in message ? message.timestamp : Date.now(),
      },
    ]
  }

  return []
}

function updateMessage(
  state: TranslatorState,
  conversationId: string,
  event: { type: string; delta?: string },
): RuntimeEvent[] {
  const messageId = state.openAssistantId
  if (messageId === undefined || event.delta === undefined) return []
  if (event.type === 'text_delta') {
    return [{ conversationId, type: 'assistant_text_delta', messageId, delta: event.delta }]
  }
  if (event.type === 'thinking_delta') {
    return [{ conversationId, type: 'assistant_thinking_delta', messageId, delta: event.delta }]
  }
  return []
}

function endMessage(
  state: TranslatorState,
  conversationId: string,
  message: { role: string; stopReason?: string },
): RuntimeEvent[] {
  const messageId = state.openAssistantId
  state.openAssistantId = undefined
  if (messageId === undefined || message.role !== 'assistant') return []
  return [
    {
      conversationId,
      type: 'assistant_message_finished',
      messageId,
      interrupted: message.stopReason === 'aborted',
    },
  ]
}
