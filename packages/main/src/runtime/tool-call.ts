/**
 * How a tool call reads in the ledger. Pure: the row's one-line summary, the details worth
 * keeping, and the exit status the shell reported. The renderer gets strings, not pi's shapes.
 */
import type { ToolDetails } from '@alpha/core'

const SUMMARY_LIMIT = 80

const stringField = (args: Record<string, unknown>, field: string): string => {
  const value = args[field]
  return typeof value === 'string' ? value : ''
}

const oneLine = (text: string): string => {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > SUMMARY_LIMIT ? `${collapsed.slice(0, SUMMARY_LIMIT - 1)}…` : collapsed
}

export function summarizeToolCall(name: string, args: unknown): string {
  if (typeof args !== 'object' || args === null) return oneLine(String(args))
  const record = args as Record<string, unknown>
  const edits = Array.isArray(record.edits) ? record.edits.length : 0

  if (name === 'bash') return oneLine(stringField(record, 'command'))
  if (name === 'read' || name === 'write') return oneLine(stringField(record, 'path'))
  if (name === 'edit') {
    const path = stringField(record, 'path')
    return oneLine(edits > 1 ? `${path} (${edits} edits)` : path)
  }
  return oneLine(JSON.stringify(record))
}

export function exitCodeFromText(text: string): number | undefined {
  const match = text.match(/exited with code (\d+)/)
  return match === null ? undefined : Number(match[1])
}

/** Only the details the row renders, in the row's own vocabulary. */
export function toolDetails(name: string, details: unknown, output = ''): ToolDetails | undefined {
  const record = typeof details === 'object' && details !== null ? (details as Record<string, unknown>) : {}
  const collected: ToolDetails = {}

  if (name === 'edit' && typeof record.diff === 'string') collected.diff = record.diff
  if (typeof record.fullOutputPath === 'string') collected.fullOutputPath = record.fullOutputPath
  if (record.truncation !== undefined) collected.truncated = true
  if (name === 'bash') {
    const exitCode = exitCodeFromText(output)
    if (exitCode !== undefined) collected.exitCode = exitCode
  }

  return Object.keys(collected).length === 0 ? undefined : collected
}

/** The row's output text: every text part of a tool result, joined. */
export function outputTextOf(result: unknown): string {
  const content = (result as { content?: unknown })?.content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) =>
      typeof part === 'object' && part !== null && (part as { type?: string }).type === 'text'
        ? String((part as { text?: unknown }).text ?? '')
        : '',
    )
    .filter((text) => text !== '')
    .join('\n')
}
