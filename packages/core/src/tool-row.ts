/**
 * How a tool call reads in the ledger: the one-line summary, the details worth keeping, the exit
 * status the shell reported, and the row all of that lands in.
 *
 * One module because there is one row. The window's copy of a call is assembled in three places —
 * the live event, the stored session entry, and the reducer that replays either — and the only
 * thing keeping those three honest is that they ask these functions for the parts.
 */
import type { Absent } from './absence.ts'
import type { ApprovalRecord, ChatBlockTool, ToolDetails } from './runtime-events.ts'
import { toolRiskOf } from './tools.ts'

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

export function exitCodeFromText(text: string): Absent<number> {
  const match = text.match(/exited with code (\d+)/)
  return match === null ? undefined : Number(match[1])
}

/** Only the details the row renders, in the row's own vocabulary. */
export function toolDetails(name: string, details: unknown, output = ''): Absent<ToolDetails> {
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

/** What is known about a call the moment it starts: from a live event, or from a stored entry. */
export interface ToolCallFacts {
  callId: string
  name: string
  args: unknown
  /** How it got past the gate, when the ledger has it. */
  approval?: ApprovalRecord
}

/** The state a row is in before its result arrives, and the only state a stored call is read in. */
export const TOOL_RUNNING: Pick<ChatBlockTool, 'status' | 'output'> = { status: 'running', output: '' }

/**
 * The row: what a call looks like before anything has come back. Live, stored and replayed calls
 * all start here, so a field added to one is a field added to all three.
 */
export function toolRowOf(call: ToolCallFacts, startedAt: number): ChatBlockTool {
  return {
    kind: 'tool',
    callId: call.callId,
    name: call.name,
    risk: toolRiskOf(call.name),
    summary: summarizeToolCall(call.name, call.args),
    raw: JSON.stringify(call.args ?? {}),
    ...TOOL_RUNNING,
    approval: call.approval,
    startedAt,
  }
}

/** What a result adds to a row: how the call ended, what it printed, and the details worth keeping. */
export interface ToolOutcome {
  status: 'ok' | 'failed'
  output: string
  details?: ToolDetails
}

/** pi's tool result, read as the row's own end state. */
export function toolOutcomeOf(
  name: string,
  result: { content?: unknown; details?: unknown; isError?: boolean } = {},
): ToolOutcome {
  const output = outputTextOf(result)
  return {
    status: result.isError === true ? 'failed' : 'ok',
    output,
    details: toolDetails(name, result.details, output),
  }
}
