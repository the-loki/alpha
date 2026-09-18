/**
 * A persisted transcript, turned back into what the window renders. The session's entries are
 * the record of truth (ADR-0004); this is the read side of the same mapping the translator does
 * for live events.
 */

import {
  type ApprovalRecord,
  type ChatBlock,
  type ChatBlockTool,
  type ChatMessage,
  textOfContent,
  toolRiskOf,
} from '@alpha/core'
import type { AgentMessage, Entry } from '@earendil-works/pi-agent-core'
import { outputTextOf, summarizeToolCall, toolDetails } from './tool-call.ts'

/** How each call got past the gate, by call id: the part of the ledger pi's session does not hold. */
export type DecisionLookup = Map<string, ApprovalRecord>

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
  const args = call.arguments ?? {}
  const callId = typeof call.id === 'string' ? call.id : `${name}-${timestamp}`
  return {
    kind: 'tool',
    callId,
    name,
    risk: toolRiskOf(name),
    summary: summarizeToolCall(name, args),
    raw: JSON.stringify(args),
    status: 'running',
    output: '',
    approval: decisions.get(callId),
    startedAt: timestamp,
  }
}

/** The result of a call lands on the row the call created, wherever that row is. */
function finishTool(messages: ChatMessage[], result: ToolResultContent): void {
  for (const message of messages) {
    const index = message.blocks.findIndex((block) => block.kind === 'tool' && block.callId === result.toolCallId)
    if (index === -1) continue
    const block = message.blocks[index] as ChatBlockTool
    const output = outputTextOf(result)
    message.blocks[index] = {
      ...block,
      status: result.isError === true ? 'failed' : 'ok',
      output,
      details: toolDetails(block.name, result.details, output),
      endedAt: result.timestamp,
    }
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

export function entriesToMessages(entries: Entry[], decisions: DecisionLookup = new Map()): ChatMessage[] {
  const messages: ChatMessage[] = []
  // The session makes no promise about the order it hands entries back in, and the transcript's
  // order is the whole point, so the sequence number decides it.
  for (const entry of [...entries].sort((left, right) => left.seq - right.seq)) {
    if (entry.type === 'compaction' || entry.type === 'branch_summary') {
      messages.push({
        id: entry.id,
        role: 'assistant',
        blocks: [{ kind: 'compaction', summary: entry.summary, replaced: undefined }],
        createdAt: entry.timestamp,
        status: 'complete',
      })
      continue
    }
    if (entry.type !== 'message') continue
    const message: AgentMessage = entry.message
    if (message.role === 'user') {
      messages.push({
        id: entry.id,
        role: 'user',
        blocks: [{ kind: 'text', text: textOfContent(message.content) }],
        createdAt: entry.timestamp,
        status: 'complete',
      })
      continue
    }
    if (message.role === 'assistant') {
      const interrupted = message.stopReason === 'aborted'
      const failed = message.stopReason === 'error'
      messages.push({
        id: entry.id,
        role: 'assistant',
        blocks: blocksOf(message.content, entry.timestamp, decisions),
        createdAt: entry.timestamp,
        status: failed ? 'failed' : interrupted ? 'interrupted' : 'complete',
      })
    }
    if (message.role === 'toolResult') {
      finishTool(messages, {
        toolCallId: message.toolCallId,
        isError: message.isError,
        content: message.content,
        details: message.details,
        timestamp: entry.timestamp,
      })
    }
  }
  return messages
}
