/**
 * A session's entries, turned into what the window renders. The transcript the agent keeps is the
 * record of truth; this is the read side of the same mapping the translator does for live events,
 * and the caller hands the entries in transcript order — walking back from the tip is the session
 * reader's job, not this one's.
 */

import {
  type ChatBlock,
  type ChatBlockTool,
  type ChatMessage,
  emptyAnswerIsEvidence,
  listOf,
  type Null,
  patchToolRow,
  toolOutcomeOf,
  toolRowOf,
  userBlocksOf,
} from '@alpha/domain'
import type { DecisionLookup } from './decisions.ts'

/** One entry of a session, as the agent reports it over the protocol. */
export interface AgentEntry {
  type: string
  id: string
  parentId?: Null<string>
  timestamp: number | string
  message?: AgentEntryMessage
  summary?: string
  /** How many messages a compaction stood in for, worked out from the path it sits on. */
  replaced?: number
  /** Where the summary stops standing in: the first entry the agent kept as it was. */
  firstKeptEntryId?: string
}

/** The message an entry carries, when it carries one. Only the fields the transcript draws. */
export interface AgentEntryMessage {
  role: string
  content?: unknown
  stopReason?: string
  /** Why a message ended in error, when it did: the row keeps the reason, not only the state. */
  errorMessage?: string
  toolCallId?: string
  /** The tool the call named, kept so a session reloaded into an agent replays faithfully. */
  toolName?: string
  isError?: boolean
  details?: unknown
  timestamp?: number
}

const blocksOf = (content: unknown[], timestamp: number, decisions: DecisionLookup): ChatBlock[] => {
  const blocks: ChatBlock[] = []
  for (const part of content) {
    if (typeof part !== 'object' || part === null || !('type' in part)) continue
    const typed = part as { type: string; text?: unknown }
    if (typed.type === 'text' && typeof typed.text === 'string') blocks.push({ kind: 'text', text: typed.text })
    if (typed.type === 'thinking' && typeof typed.text === 'string') blocks.push({ kind: 'thinking', text: typed.text })
    if (typed.type === 'toolCall') blocks.push(toolBlockOf(part, timestamp, decisions))
  }
  return blocks
}

/** A call that was persisted starts as running; its result entry, later in the log, finishes it. */
function toolBlockOf(part: unknown, timestamp: number, decisions: DecisionLookup): ChatBlockTool {
  const call = part as { id?: unknown; name?: unknown; arguments?: unknown }
  const name = typeof call.name === 'string' ? call.name : 'tool'
  const callId = typeof call.id === 'string' ? call.id : `${name}-${timestamp}`
  return toolRowOf({ callId, name, args: call.arguments ?? {}, approval: decisions.get(callId) }, timestamp)
}

/** The result of a call lands on the row the call created, wherever that row is — the shared
 * placement rule in `@alpha/domain`, applied to the list being read back. */
function finishTool(messages: ChatMessage[], result: ToolResultContent): void {
  for (const message of messages) {
    const blocks = patchToolRow(message.blocks, result.toolCallId, (block) => ({
      ...block,
      ...toolOutcomeOf(block.name, { ...result, isError: result.isError === true }),
      endedAt: result.timestamp,
    }))
    if (blocks === undefined) continue
    message.blocks = blocks
    return
  }
}

interface ToolResultContent {
  toolCallId: string
  isError?: boolean
  content?: unknown
  details?: unknown
  timestamp: number
}

export function entriesToMessages(entries: AgentEntry[], decisions: DecisionLookup = new Map()): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (const entry of entries) {
    if (entry.type === 'compaction' || entry.type === 'branch_summary') {
      messages.push({
        id: entry.id,
        role: 'assistant',
        blocks: [{ kind: 'compaction', summary: entry.summary ?? '', replaced: entry.replaced }],
        createdAt: at(entry.timestamp),
        status: 'complete',
      })
      continue
    }
    if (entry.type !== 'message') continue
    const message = entry.message
    if (message === undefined) continue
    if (message.role === 'user') {
      messages.push({
        id: entry.id,
        role: 'user',
        blocks: userBlocksOf(message.content),
        createdAt: at(entry.timestamp),
        status: 'complete',
      })
      continue
    }
    if (message.role === 'assistant') {
      const interrupted = message.stopReason === 'aborted'
      const failed = message.stopReason === 'error'
      const blocks = blocksOf(listOf(message.content), at(entry.timestamp), decisions)
      // An empty answer is a row only when it is evidence: the one rule the live reducer applies
      // too, and it lives in `@alpha/domain` so the two cannot drift.
      if (blocks.length === 0 && !emptyAnswerIsEvidence(failed, interrupted)) continue
      // What the entry recorded is whoever failed it saying so: the words are theirs, quoted. A
      // record holds no refusal — a turn that never started wrote no entry to hold one.
      const said = message.errorMessage
      messages.push({
        id: entry.id,
        role: 'assistant',
        blocks,
        createdAt: at(entry.timestamp),
        status: failed ? 'failed' : interrupted ? 'interrupted' : 'complete',
        ...(failed && said !== undefined ? { failure: { said } } : {}),
      })
    }
    if (message.role === 'toolResult') {
      finishTool(messages, {
        toolCallId: message.toolCallId ?? '',
        isError: message.isError,
        content: message.content,
        details: message.details,
        timestamp: at(entry.timestamp),
      })
    }
  }
  return messages
}

const at = (timestamp: number | string): number =>
  typeof timestamp === 'number' ? timestamp : Date.parse(timestamp) || Date.now()
