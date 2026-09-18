/**
 * The renderer's projection of a conversation. A pure reducer over runtime events, so the whole
 * streaming story is testable without React, without Electron, and without a model.
 *
 * The one rule that shapes this module: a streaming message is held apart from the transcript,
 * in `streaming`. The transcript array is replaced only when a message is appended — once for
 * the user's message and once when the assistant's finishes — so two hundred text deltas cost
 * two hundred small objects, not two hundred copies of the conversation.
 */
import type { ChatBlock, ChatMessage, ConversationSummary, RuntimeEvent } from './runtime-events.ts'

export interface TranscriptState {
  conversationId: string
  summary?: ConversationSummary
  messages: ChatMessage[]
  streaming?: ChatMessage
  status: 'idle' | 'running' | 'failed'
  error?: string
}

export function emptyTranscript(conversationId: string): TranscriptState {
  return { conversationId, messages: [], status: 'idle' }
}

export function streamingMessage(state: TranscriptState): ChatMessage | undefined {
  return state.streaming
}

export function visibleMessages(state: TranscriptState): ChatMessage[] {
  return state.streaming === undefined ? state.messages : [...state.messages, state.streaming]
}

export function reduceTranscript(state: TranscriptState, event: RuntimeEvent): TranscriptState {
  if (event.conversationId !== state.conversationId) return state

  switch (event.type) {
    case 'conversation_opened':
      return {
        conversationId: state.conversationId,
        summary: event.conversation,
        messages: event.messages,
        status: 'idle',
      }

    case 'conversation_updated':
      return { ...state, summary: event.conversation }

    case 'turn_started':
      return { ...state, status: 'running', error: undefined }

    case 'user_message':
      return { ...state, messages: [...state.messages, event.message] }

    case 'assistant_message_started':
      return {
        ...state,
        streaming: {
          id: event.messageId,
          role: 'assistant',
          blocks: [],
          createdAt: event.createdAt,
          status: 'streaming',
        },
      }

    case 'assistant_text_delta':
      return appendDelta(state, event.messageId, 'text', event.delta)

    case 'assistant_thinking_delta':
      return appendDelta(state, event.messageId, 'thinking', event.delta)

    case 'assistant_message_finished':
      return finishStreaming(state, event.interrupted)

    case 'turn_finished':
      return { ...state, status: 'idle' }

    case 'run_failed':
      return failRun(state, event.message)

    default:
      return state
  }
}

/** A failure keeps whatever was streamed: the half-written answer is evidence, not debris. */
function failRun(state: TranscriptState, message: string): TranscriptState {
  const streaming = state.streaming
  const failed = streaming === undefined ? undefined : { ...streaming, status: 'failed' as const, error: message }
  return {
    ...state,
    messages: failed === undefined ? state.messages : [...state.messages, failed],
    streaming: undefined,
    status: 'failed',
    error: message,
  }
}

function appendDelta(
  state: TranscriptState,
  messageId: string,
  kind: ChatBlock['kind'],
  delta: string,
): TranscriptState {
  const streaming = state.streaming
  if (streaming === undefined || streaming.id !== messageId) return state

  const last = streaming.blocks[streaming.blocks.length - 1]
  const blocks: ChatBlock[] =
    last !== undefined && last.kind === kind
      ? [...streaming.blocks.slice(0, -1), { kind, text: last.text + delta }]
      : [...streaming.blocks, { kind, text: delta }]

  return { ...state, streaming: { ...streaming, blocks } }
}

function finishStreaming(state: TranscriptState, interrupted: boolean): TranscriptState {
  const streaming = state.streaming
  if (streaming === undefined) return state
  const finished: ChatMessage = { ...streaming, status: interrupted ? 'interrupted' : 'complete' }
  return { ...state, messages: [...state.messages, finished], streaming: undefined }
}
