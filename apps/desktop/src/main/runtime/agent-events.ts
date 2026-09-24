/**
 * What the agent says, in the workbench's terms.
 *
 * The agent has its own vocabulary for a run — turns that are single model calls, messages that
 * start and end, tools that begin and stream and finish — and the window has one that is older
 * than any agent: a turn the composer follows, a message that streams, rows in the ledger. This
 * module is the only place that knows both, so the store, the ledger and the transcript code do
 * not have to learn a second language when the agent is replaced.
 *
 * Three of these mappings are not one-to-one and are worth knowing about:
 *
 * - pi's turn is one model call; Alpha's is the whole run. So `agent_start` opens it and
 *   `agent_end`/`agent_settled` close it, and pi's own turn events are left alone.
 * - pi reports usage cumulatively while a message streams, and the window adds up what it is told.
 *   What goes out here is the *difference* since the last report, or the same tokens would be
 *   counted once per delta.
 * - A run that failed is not an event of its own: pi ends the run with an assistant message whose
 *   `stopReason` is `error` and whose `errorMessage` is why. Reading it there is what turns a run
 *   that produced nothing into a window that says what went wrong — unless pi is going to retry,
 *   in which case the run is still running.
 */

import {
  EMPTY_USAGE,
  listOf,
  type RuntimeEvent,
  recordOf,
  type ToolDetails,
  type ToolStatus,
  type Undef,
  type UsageTotals,
  usageTotals,
  userBlocksOf,
} from '@alpha/domain'
import type { RetryDecider } from '@alpha/plugin'

/** A record off the agent's pipe, as it arrives: shaped by the agent, not by this file. */
export interface RpcLikeEvent {
  type: string
  [field: string]: unknown
}

const textOfPart = (part: unknown): string => {
  const block = recordOf(part)
  return block.type === 'text' && typeof block.text === 'string' ? block.text : ''
}

/** The text of a tool result, which is what the row and the model both read. */
const textOfResult = (result: unknown): string => listOf(recordOf(result).content).map(textOfPart).join('')

/** What one report adds to the last one: pi counts up, the window counts the difference. */
function difference(now: UsageTotals, before: UsageTotals): UsageTotals {
  const part = (left: number, right: number): number => Math.max(0, left - right)
  return {
    input: part(now.input, before.input),
    output: part(now.output, before.output),
    cacheRead: part(now.cacheRead, before.cacheRead),
    cacheWrite: part(now.cacheWrite, before.cacheWrite),
    totalTokens: part(now.totalTokens, before.totalTokens),
    cost: part(now.cost, before.cost),
  }
}

const isNothing = (usage: UsageTotals): boolean => usage.totalTokens === 0 && usage.cost === 0

/** Where pi's cumulative numbers ride: on the message being streamed (and on the run's own report). */
const reportedUsage = (event: RpcLikeEvent): UsageTotals => usageTotals(recordOf(event.message).usage ?? event.usage)

/**
 * The failure a raw `agent_end` carries, when its last message is an assistant one that erred —
 * pi has no failure event of its own. This is the one decoder: the translator reads it to say
 * `run_failed`, and the retry policy is asked about exactly what it read.
 */
export function failedMessageOf(event: RpcLikeEvent): Undef<string> {
  if (event.type !== 'agent_end' || !Array.isArray(event.messages)) return undefined
  const last = event.messages.at(-1)
  if (typeof last !== 'object' || last === null) return undefined
  const message = last as { role?: unknown; stopReason?: unknown; errorMessage?: unknown }
  if (message.role !== 'assistant' || message.stopReason !== 'error') return undefined
  return typeof message.errorMessage === 'string' && message.errorMessage !== ''
    ? message.errorMessage
    : 'The run failed.'
}

export class AgentEventTranslator {
  private readonly conversationId: string
  private readonly retry: Undef<RetryDecider>
  private usage: UsageTotals = EMPTY_USAGE
  private openMessageId: Undef<string>
  private runOpen = false

  public constructor(conversationId: string, retry?: RetryDecider) {
    this.conversationId = conversationId
    this.retry = retry
  }

  public translate(event: RpcLikeEvent): RuntimeEvent[] {
    if (event.type === 'agent_start') return this.startRun()
    if (event.type === 'agent_end') return this.endRun(event)
    if (event.type === 'agent_settled') return this.settle()
    if (event.type === 'message_start') return this.startMessage(event)
    if (event.type === 'message_update') return this.update(event)
    if (event.type === 'message_end') return this.endMessage(event)
    if (event.type === 'entry_appended') return this.appended(event)
    if (event.type === 'tool_execution_start') return [this.toolStarted(event)]
    if (event.type === 'tool_execution_update') return [this.toolOutput(event)]
    if (event.type === 'tool_execution_end') return [this.toolFinished(event)]
    if (event.type === 'compaction_end') return this.compacted(event)
    return []
  }

  private startRun(): RuntimeEvent[] {
    // A retry starts the agent again inside the same run: the turn the composer is following has
    // already begun, and saying so twice is a second turn that never happened.
    if (this.runOpen) return []
    this.runOpen = true
    this.usage = EMPTY_USAGE
    return [{ conversationId: this.conversationId, type: 'turn_started' }]
  }

  /**
   * A run that ended with the agent's own error message is a failure, not a finished turn — and
   * whether that failure is final is the retry policy's one decision, the same one its own hook
   * consults when it takes an attempt. Nothing is written on the event to coordinate the two.
   */
  private endRun(event: RpcLikeEvent): RuntimeEvent[] {
    if (!this.runOpen) return []
    const failed = failedMessageOf(event)
    if (failed !== undefined && this.retry?.shouldRetry({ failed, aborted: false }) === true) return []
    this.runOpen = false
    this.openMessageId = undefined
    return failed === undefined
      ? [{ conversationId: this.conversationId, type: 'turn_finished' }]
      : [{ conversationId: this.conversationId, type: 'run_failed', message: failed }]
  }

  /** `agent_settled` follows `agent_end`: whichever comes first closes the run, the other is quiet. */
  private settle(): RuntimeEvent[] {
    if (!this.runOpen) return []
    this.runOpen = false
    return [{ conversationId: this.conversationId, type: 'turn_finished' }]
  }

  private startMessage(event: RpcLikeEvent): RuntimeEvent[] {
    const message = recordOf(event.message)
    if (message.role !== 'assistant') return []
    const opened = {
      conversationId: this.conversationId,
      type: 'assistant_message_started' as const,
      messageId: crypto.randomUUID(),
      createdAt: Date.now(),
    }
    this.openMessageId = opened.messageId
    return [opened]
  }

  private update(event: RpcLikeEvent): RuntimeEvent[] {
    const events: RuntimeEvent[] = []
    const delta = recordOf(event.assistantMessageEvent)
    const at = Date.now()
    const text = typeof delta.delta === 'string' ? delta.delta : ''
    if (this.openMessageId !== undefined && delta.type === 'text_delta' && text !== '') {
      events.push({
        conversationId: this.conversationId,
        type: 'assistant_text_delta',
        messageId: this.openMessageId,
        delta: text,
        at,
      })
    }
    if (this.openMessageId !== undefined && delta.type === 'thinking_delta' && text !== '') {
      events.push({
        conversationId: this.conversationId,
        type: 'assistant_thinking_delta',
        messageId: this.openMessageId,
        delta: text,
        at,
      })
    }
    const reported = reportedUsage(event)
    const added = difference(reported, this.usage)
    this.usage = reported
    if (!isNothing(added)) {
      events.push({ conversationId: this.conversationId, type: 'usage_recorded', usage: added })
    }
    return events
  }

  private endMessage(event: RpcLikeEvent): RuntimeEvent[] {
    const message = recordOf(event.message)
    if (message.role !== 'assistant' || this.openMessageId === undefined) return []
    const finished: RuntimeEvent = {
      conversationId: this.conversationId,
      type: 'assistant_message_finished',
      messageId: this.openMessageId,
      interrupted: message.stopReason === 'aborted',
    }
    this.openMessageId = undefined
    const reported = reportedUsage(event)
    const added = difference(reported, this.usage)
    this.usage = reported
    return isNothing(added)
      ? [finished]
      : [finished, { conversationId: this.conversationId, type: 'usage_recorded', usage: added }]
  }

  /**
   * The person's own message, which pi records rather than streams: it arrives as the entry that
   * was added to the session, complete, and it is what the window draws on the left.
   */
  private appended(event: RpcLikeEvent): RuntimeEvent[] {
    const entry = recordOf(event.entry)
    const message = recordOf(entry.message)
    if (entry.type !== 'message' || message.role !== 'user') return []
    return [
      {
        conversationId: this.conversationId,
        type: 'user_message',
        message: {
          id: typeof entry.id === 'string' ? entry.id : crypto.randomUUID(),
          role: 'user',
          blocks: userBlocksOf(message.content),
          createdAt: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
          status: 'complete',
        },
      },
    ]
  }

  private toolStarted(event: RpcLikeEvent): RuntimeEvent {
    const callId = String(event.toolCallId ?? '')
    return {
      conversationId: this.conversationId,
      type: 'tool_started',
      callId,
      name: String(event.toolName ?? ''),
      args: event.args,
      startedAt: Date.now(),
    }
  }

  private toolOutput(event: RpcLikeEvent): RuntimeEvent {
    return {
      conversationId: this.conversationId,
      type: 'tool_output',
      callId: String(event.toolCallId ?? ''),
      // pi accumulates the partial result rather than streaming a delta, and the row replaces
      // what it shows, so the two agree without bookkeeping here.
      output: textOfResult(event.partialResult),
    }
  }

  private toolFinished(event: RpcLikeEvent): RuntimeEvent {
    const details = recordOf(event.result).details
    return {
      conversationId: this.conversationId,
      type: 'tool_finished',
      callId: String(event.toolCallId ?? ''),
      status: (event.isError === true ? 'failed' : 'ok') as ToolStatus,
      output: textOfResult(event.result),
      ...(details === undefined ? {} : { details: details as ToolDetails }),
      endedAt: Date.now(),
    }
  }

  /** A compaction is a structural change: the summary stands in for what came before it. */
  private compacted(event: RpcLikeEvent): RuntimeEvent[] {
    const result = recordOf(event.result)
    const summary = typeof result.summary === 'string' ? result.summary : ''
    if (summary === '') return []
    return [{ conversationId: this.conversationId, type: 'history_compacted', summary, at: Date.now() }]
  }
}
