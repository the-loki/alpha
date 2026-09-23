/**
 * The change a call is about to make, rendered as a diff before it runs. The gate shows this on the
 * approval card, and it is built from the arguments the model sent — not from the file on disk —
 * so the card describes the proposal rather than the current state.
 */

import type { Undef } from './maybe.ts'

const PREVIEW_LIMIT = 40

const PATH_TOOLS = ['write', 'edit']

interface Edit {
  oldText?: unknown
  newText?: unknown
}

export function changePreview(toolName: string, args: Record<string, unknown>): Undef<string> {
  if (!PATH_TOOLS.includes(toolName)) return undefined
  const path = typeof args.path === 'string' ? args.path : undefined
  if (path === undefined) return undefined

  const body = toolName === 'write' ? addedLines(args.content) : editLines(args.edits)
  if (body === undefined) return undefined

  return [`--- ${path}`, `+++ ${path}`, ...cap(body)].join('\n')
}

/** A write replaces the whole file, so every line of it is an addition. */
function addedLines(content: unknown): Undef<string[]> {
  if (typeof content !== 'string') return undefined
  return content.split('\n').map((line) => `+${line}`)
}

/** An edit says what it removes and what it puts in its place; both sides are shown. */
function editLines(edits: unknown): Undef<string[]> {
  if (!Array.isArray(edits)) return undefined
  const lines: string[] = []
  for (const raw of edits) {
    const edit = typeof raw === 'object' && raw !== null ? (raw as Edit) : {}
    if (typeof edit.oldText !== 'string' || typeof edit.newText !== 'string') return undefined
    lines.push(...edit.oldText.split('\n').map((line) => `-${line}`))
    lines.push(...edit.newText.split('\n').map((line) => `+${line}`))
  }
  return lines
}

/** The body is what a card can drown in, so the cap is on the body; the file's name always shows. */
function cap(lines: string[]): string[] {
  if (lines.length <= PREVIEW_LIMIT) return lines
  return [...lines.slice(0, PREVIEW_LIMIT), `… ${lines.length - PREVIEW_LIMIT} more lines`]
}
