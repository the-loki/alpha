/**
 * Text out of message content, which arrives in several shapes: a string, or parts of which the
 * text ones are the message. Three modules were each doing this their own way; this is that way.
 */

import { attachmentsOf } from './attachments.ts'
import type { ChatBlock } from './runtime-events.ts'

export interface ContentPart {
  type?: string
  text?: unknown
}

export function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      const typed = typeof part === 'object' && part !== null ? (part as ContentPart) : {}
      return typed.type === 'text' && typeof typed.text === 'string' ? typed.text : ''
    })
    .filter((text) => text !== '')
    .join('\n')
}

/**
 * A user message as blocks: what it says, then what came with it. The attachments ride inside the
 * message's own content rather than beside it, so this is the one place that reads them out — for
 * the live event and for a transcript read back off disk alike.
 */
export function userBlocksOf(content: unknown): ChatBlock[] {
  const blocks: ChatBlock[] = []
  const words = textOfContent(content)
  if (words !== '') blocks.push({ kind: 'text', text: words })
  for (const attachment of attachmentsOf(content)) {
    blocks.push({ kind: 'attachment', mimeType: attachment.mimeType, data: attachment.data })
  }
  return blocks
}

/** Parses JSON that came from a file, without pretending a broken file is an empty one. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
