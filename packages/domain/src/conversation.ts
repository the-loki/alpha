/**
 * Conversation bookkeeping: the title a conversation gets, and the ids that name it. Pure, so
 * the rules are testable without a runtime or a filesystem.
 */
import type { ConversationSummary } from './runtime-events.ts'

export const TITLE_LIMIT = 60

export function titleFromMessage(text: string): string {
  const firstLine = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .find((line) => line !== '')
  if (firstLine === undefined) return 'New conversation'
  return firstLine.length > TITLE_LIMIT ? `${firstLine.slice(0, TITLE_LIMIT)}…` : firstLine
}

export function titleFromPath(path: string, fallback: string): string {
  const segments = path.split(/[/\\]/).filter((segment) => segment !== '')
  return segments.length === 0 ? fallback : segments[segments.length - 1]
}

export function summarize(
  conversation: ConversationSummary,
  changes: Partial<ConversationSummary>,
): ConversationSummary {
  return { ...conversation, ...changes, updatedAt: changes.updatedAt ?? Date.now() }
}
