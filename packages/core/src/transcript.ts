/**
 * The renderer's projection of a conversation. A pure reducer over runtime events, so the whole
 * streaming story is testable without a window, without Electron, and without a model.
 *
 * The one rule that shapes this module: a streaming message is held apart from the transcript,
 * in `streaming`. The transcript array is replaced only when a message is appended — once for
 * the user's message and once when the assistant's finishes — so two hundred text deltas cost
 * two hundred small objects, not two hundred copies of the conversation.
 */
import type { Undef } from './maybe.ts'
import type {
  ApprovalRequest,
  ChatBlock,
  ChatBlockTool,
  ChatMessage,
  ConversationSummary,
  QueuedMessage,
  RuntimeEvent,
} from './runtime-events.ts'
import { emptyAnswerIsEvidence, patchToolRow, toolRowOf } from './tool-row.ts'
import { addUsage, EMPTY_USAGE, type UsageTotals } from './usage.ts'

/** One turn's spending, in the order the turns happened. */
export interface TurnUsage {
  usage: UsageTotals
  /** True for the one row that stands in for everything spent before this window opened. */
  earlier?: true
}

export interface TranscriptState {
  conversationId: string
  summary?: ConversationSummary
  messages: ChatMessage[]
  streaming?: ChatMessage
  /** Calls waiting on the user, oldest first. */
  approvals: ApprovalRequest[]
  /** Messages waiting behind the running turn, oldest first. */
  queued: QueuedMessage[]
  /** Whether the queue is stopped: a failed turn and a Stop both stop it, Resume starts it. */
  queuedPaused: boolean
  /**
   * What each turn spent, so a review can see where the tokens went. This is the session's
   * spending: `totalUsage` sums it rather than keeping a second copy that could drift.
   */
  turns: TurnUsage[]
  /** The turn being counted, which becomes a row when it finishes. Never carries history. */
  turnUsage: UsageTotals
  status: 'idle' | 'running' | 'failed'
  error?: string
}

export function emptyTranscript(conversationId: string): TranscriptState {
  return {
    conversationId,
    messages: [],
    approvals: [],
    queued: [],
    queuedPaused: false,
    turns: [],
    turnUsage: EMPTY_USAGE,
    status: 'idle',
  }
}

/**
 * A conversation that already has spending behind it opens with one row for it. The history is a
 * row of its own rather than being spread over turns nobody can see any more: the header's total
 * is the sum of the rows, and that has to stay true across a relaunch — which means the next turn
 * counts from zero, not from the history it would otherwise carry into its own row.
 */
export function openingTranscript(
  conversationId: string,
  conversation: ConversationSummary,
  messages: ChatMessage[],
  usage: UsageTotals,
): TranscriptState {
  return {
    ...emptyTranscript(conversationId),
    summary: conversation,
    messages,
    turns: usage.totalTokens === 0 ? [] : [{ usage, earlier: true }],
  }
}

/** The total is the sum of the rows, so the two can never drift apart. */
export function totalUsage(state: TranscriptState): UsageTotals {
  return state.turns.reduce((sum, turn) => addUsage(sum, turn.usage), EMPTY_USAGE)
}

export function streamingMessage(state: TranscriptState): Undef<ChatMessage> {
  return state.streaming
}

export function visibleMessages(state: TranscriptState): ChatMessage[] {
  return state.streaming === undefined ? state.messages : [...state.messages, state.streaming]
}

export function reduceTranscript(state: TranscriptState, event: RuntimeEvent): TranscriptState {
  if (event.conversationId !== state.conversationId) return state

  switch (event.type) {
    case 'conversation_opened':
      return openingTranscript(state.conversationId, event.conversation, event.messages, event.usage)

    case 'conversation_updated':
      return { ...state, summary: event.conversation }

    case 'transcript_replaced':
      return {
        ...state,
        messages: event.messages,
        streaming: undefined,
        queued: [],
        queuedPaused: false,
        status: 'idle',
        error: undefined,
      }

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
      return closeTurn({ ...state, status: 'idle', approvals: [] })

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

    case 'tool_decided':
      return mapToolBlocks(state, event.callId, (block) => ({ ...block, approval: event.approval }))

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
      return { ...state, queued: event.queued, queuedPaused: event.paused }

    case 'usage_recorded':
      return { ...state, turnUsage: addUsage(state.turnUsage, event.usage) }

    case 'history_compacted':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `compaction-${state.messages.length}`,
            role: 'assistant',
            blocks: [{ kind: 'compaction', summary: event.summary, replaced: event.replaced }],
            createdAt: event.at,
            status: 'complete',
          },
        ],
      }

    default:
      return state
  }
}

/**
 * A tool call arrives after the assistant message that requested it has been written, so the row
 * is attached to that message: the ledger reads as one entry per request, with its result.
 */
/** A finished turn's spending joins the list, and the next turn starts counting from zero. */
function closeTurn(state: TranscriptState): TranscriptState {
  const spent = state.turnUsage
  const turns = spent.totalTokens === 0 ? state.turns : [...state.turns, { usage: spent }]
  return { ...state, turns, turnUsage: EMPTY_USAGE }
}

function appendToolCall(
  state: TranscriptState,
  event: Extract<RuntimeEvent, { type: 'tool_started' }>,
): TranscriptState {
  const tool = toolRowOf(event, event.startedAt)

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

/** A failure keeps whatever was streamed: the half-written answer is evidence, not debris. With
 * nothing streamed, the failure is itself the message — a run that produced nothing still says
 * what went wrong. */
function failRun(state: TranscriptState, message: string): TranscriptState {
  const streamed = state.streaming
  const failed: ChatMessage = {
    ...(streamed ?? { id: `failure-${state.messages.length}`, role: 'assistant', blocks: [], createdAt: Date.now() }),
    status: 'failed',
    error: message,
  }
  return {
    ...state,
    messages: [...state.messages, failed],
    streaming: undefined,
    approvals: [],
    status: 'failed',
    error: message,
  }
}

/**
 * A tool row belongs to the assistant message that asked for the call. That message may still be
 * streaming or may already have moved into the transcript, so the search covers both. The
 * placement itself is the shared rule in tool-row.
 */
function mapToolBlocks(
  state: TranscriptState,
  callId: string,
  change: (block: ChatBlockTool) => ChatBlockTool,
): TranscriptState {
  const streaming = state.streaming
  if (streaming !== undefined) {
    const blocks = patchToolRow(streaming.blocks, callId, change)
    if (blocks !== undefined) return { ...state, streaming: { ...streaming, blocks } }
  }

  let holds = false
  const messages = state.messages.map((message) => {
    const blocks = patchToolRow(message.blocks, callId, change)
    if (blocks === undefined) return message
    holds = true
    return { ...message, blocks }
  })
  return holds ? { ...state, messages } : state
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
  // An empty answer is a row only when it is evidence — a stop, here; a failure is run_failed's
  // own answer below. The rule is the read-back's too, and it lives in tool-row.
  if (streaming.blocks.length === 0 && !emptyAnswerIsEvidence(false, interrupted)) {
    return { ...state, streaming: undefined }
  }
  const finished: ChatMessage = { ...streaming, status: interrupted ? 'interrupted' : 'complete' }
  return { ...state, messages: [...state.messages, finished], streaming: undefined }
}
