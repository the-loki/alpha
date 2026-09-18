/**
 * The renderer's projection of a conversation. A pure reducer over runtime events, so the whole
 * streaming story is testable without React, without Electron, and without a model.
 *
 * The one rule that shapes this module: a streaming message is held apart from the transcript,
 * in `streaming`. The transcript array is replaced only when a message is appended — once for
 * the user's message and once when the assistant's finishes — so two hundred text deltas cost
 * two hundred small objects, not two hundred copies of the conversation.
 */
import type {
  ApprovalRequest,
  ChatBlock,
  ChatBlockTool,
  ChatMessage,
  ConversationSummary,
  QueuedMessage,
  RuntimeEvent,
} from './runtime-events.ts'

export interface TranscriptState {
  conversationId: string
  summary?: ConversationSummary
  messages: ChatMessage[]
  streaming?: ChatMessage
  /** Calls waiting on the user, oldest first. */
  approvals: ApprovalRequest[]
  /** Messages waiting behind the running turn, oldest first. */
  queued: QueuedMessage[]
  status: 'idle' | 'running' | 'failed'
  error?: string
}

export function emptyTranscript(conversationId: string): TranscriptState {
  return { conversationId, messages: [], approvals: [], queued: [], status: 'idle' }
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
        approvals: [],
        queued: [],
        status: 'idle',
      }

    case 'conversation_updated':
      return { ...state, summary: event.conversation }

    case 'transcript_replaced':
      return { ...state, messages: event.messages, streaming: undefined, queued: [], status: 'idle', error: undefined }

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
      return appendDelta(state, event.messageId, 'text', event.delta, event.at)

    case 'assistant_thinking_delta':
      return appendDelta(state, event.messageId, 'thinking', event.delta, event.at)

    case 'assistant_message_finished':
      return finishStreaming(state, event.interrupted)

    case 'turn_finished':
      return { ...state, status: 'idle', approvals: [] }

    case 'run_failed':
      return failRun(state, event.message)

    default:
      return reduceGateEvent(state, event)
  }
}

/** The gate's own events: a call waiting on the user, and the answer that releases it. */
function reduceGateEvent(state: TranscriptState, event: RuntimeEvent): TranscriptState {
  switch (event.type) {
    case 'tool_started':
      return appendToolCall(state, event)

    case 'tool_output':
      return mapToolBlocks(state, event.callId, (block) => ({ ...block, output: event.output }))

    case 'tool_finished':
      return mapToolBlocks(state, event.callId, (block) => ({
        ...block,
        status: event.status,
        output: event.output,
        details: event.details ?? block.details,
        endedAt: event.endedAt,
      }))

    case 'approval_requested':
      return { ...state, approvals: [...state.approvals, event.request] }

    case 'approval_decided':
      return { ...state, approvals: state.approvals.filter((request) => request.requestId !== event.requestId) }

    case 'queue_updated':
      return { ...state, queued: event.queued }

    default:
      return state
  }
}

/**
 * A tool call arrives after the assistant message that requested it has been written, so the row
 * is attached to that message: the ledger reads as one entry per request, with its result.
 */
function appendToolCall(
  state: TranscriptState,
  event: Extract<RuntimeEvent, { type: 'tool_started' }>,
): TranscriptState {
  const tool: ChatBlockTool = {
    kind: 'tool',
    callId: event.callId,
    name: event.name,
    risk: event.risk,
    summary: event.summary,
    raw: event.raw,
    status: 'running',
    output: '',
    approval: event.approval,
    startedAt: event.startedAt,
  }

  const streaming = state.streaming
  if (streaming !== undefined) return { ...state, streaming: { ...streaming, blocks: [...streaming.blocks, tool] } }

  const lastAssistant = [...state.messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.status !== 'failed')
  if (lastAssistant === undefined) {
    return { ...state, messages: [...state.messages, assistantWith(tool)] }
  }
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === lastAssistant.id ? { ...message, blocks: [...message.blocks, tool] } : message,
    ),
  }
}

function assistantWith(tool: ChatBlockTool): ChatMessage {
  return { id: `tool-${tool.callId}`, role: 'assistant', blocks: [tool], createdAt: tool.startedAt, status: 'complete' }
}

/** A failure keeps whatever was streamed: the half-written answer is evidence, not debris. */
function failRun(state: TranscriptState, message: string): TranscriptState {
  const streaming = state.streaming
  const failed = streaming === undefined ? undefined : { ...streaming, status: 'failed' as const, error: message }
  return {
    ...state,
    messages: failed === undefined ? state.messages : [...state.messages, failed],
    streaming: undefined,
    approvals: [],
    status: 'failed',
    error: message,
  }
}

/**
 * A tool row belongs to the assistant message that asked for the call. That message may still be
 * streaming or may already have moved into the transcript, so the search covers both.
 */
function mapToolBlocks(
  state: TranscriptState,
  callId: string,
  change: (block: ChatBlockTool) => ChatBlockTool,
): TranscriptState {
  const isTool = (block: ChatBlock) => block.kind === 'tool' && block.callId === callId
  const holdsRow = (message: ChatMessage): boolean => message.blocks.some(isTool)
  const patch = (message: ChatMessage): ChatMessage => {
    const index = message.blocks.findIndex(isTool)
    const block = index === -1 ? undefined : message.blocks[index]
    if (block === undefined || block.kind !== 'tool') return message
    const blocks = [...message.blocks]
    blocks[index] = change(block)
    return { ...message, blocks }
  }

  const streaming = state.streaming
  if (streaming !== undefined && holdsRow(streaming)) {
    return { ...state, streaming: patch(streaming) }
  }
  if (!state.messages.some(holdsRow)) return state
  return { ...state, messages: state.messages.map((message) => patch(message)) }
}

function appendDelta(
  state: TranscriptState,
  messageId: string,
  kind: 'text' | 'thinking',
  delta: string,
  at: number,
): TranscriptState {
  const streaming = state.streaming
  if (streaming === undefined || streaming.id !== messageId) return state

  const last = streaming.blocks[streaming.blocks.length - 1]
  if (last !== undefined && last.kind === kind) {
    const grown: ChatBlock =
      last.kind === 'thinking'
        ? { ...last, text: last.text + delta, endedAt: at }
        : { ...last, text: last.text + delta }
    return { ...state, streaming: { ...streaming, blocks: [...streaming.blocks.slice(0, -1), grown] } }
  }

  const fresh: ChatBlock =
    kind === 'thinking' ? { kind, text: delta, startedAt: at, endedAt: at } : { kind, text: delta }
  return { ...state, streaming: { ...streaming, blocks: [...streaming.blocks, fresh] } }
}

function finishStreaming(state: TranscriptState, interrupted: boolean): TranscriptState {
  const streaming = state.streaming
  if (streaming === undefined) return state
  const finished: ChatMessage = { ...streaming, status: interrupted ? 'interrupted' : 'complete' }
  return { ...state, messages: [...state.messages, finished], streaming: undefined }
}
