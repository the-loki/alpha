/**
 * A persisted transcript, turned back into what the window renders. The session's entries are
 * the record of truth (ADR-0004); this is the read side of the same mapping the translator does
 * for live events.
 */

import type { ChatBlock, ChatMessage } from '@alpha/core'
import type { AgentMessage, Entry } from '@earendil-works/pi-agent-core'

const textOf = (content: string | unknown[]): string => {
  if (typeof content === 'string') return content
  return content
    .map((part) => {
      if (typeof part === 'object' && part !== null && 'type' in part && part.type === 'text') {
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      }
      return ''
    })
    .filter((text) => text !== '')
    .join('\n')
}

const blocksOf = (content: unknown[]): ChatBlock[] => {
  const blocks: ChatBlock[] = []
  for (const part of content) {
    if (typeof part !== 'object' || part === null || !('type' in part)) continue
    const typed = part as { type: string; text?: unknown }
    if (typed.type === 'text' && typeof typed.text === 'string') blocks.push({ kind: 'text', text: typed.text })
    if (typed.type === 'thinking' && typeof typed.text === 'string') blocks.push({ kind: 'thinking', text: typed.text })
  }
  return blocks
}

export function entriesToMessages(entries: Entry[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  // The session makes no promise about the order it hands entries back in, and the transcript's
  // order is the whole point, so the sequence number decides it.
  for (const entry of [...entries].sort((left, right) => left.seq - right.seq)) {
    if (entry.type !== 'message') continue
    const message: AgentMessage = entry.message
    if (message.role === 'user') {
      messages.push({
        id: entry.id,
        role: 'user',
        blocks: [{ kind: 'text', text: textOf(message.content) }],
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
        blocks: blocksOf(message.content),
        createdAt: entry.timestamp,
        status: failed ? 'failed' : interrupted ? 'interrupted' : 'complete',
      })
    }
  }
  return messages
}
