/**
 * Text out of message content, which arrives in several shapes: a string, or parts of which the
 * text ones are the message. Three modules were each doing this their own way; this is that way.
 */

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

/** Parses JSON that came from a file, without pretending a broken file is an empty one. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
