/**
 * The sessions the previous Alpha wrote, read once so the conversations in them keep working.
 *
 * Alpha used to own a session store, and its files begin with a header of its own
 * (`{"v":4,"kind":"header",…}`) followed by transactions. The agent Alpha runs now reads the
 * agent's own format (`{"type":"session","version":3,…}` followed by entries), and refuses the old
 * one outright. So a conversation that exists only as an old file is copied into a session the
 * agent can open — the copy is written under the conversation's own id, and the old file is left
 * exactly as it was: nothing is migrated by rewriting what the person has.
 *
 * This module is a door, not a store: it goes one way, it is only needed while old files exist, and
 * nothing else in Alpha reads or writes a session file.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Null, Undef } from '@alpha/core'

/** An entry of an old file, as far as importing one cares. */
interface LegacyEntry {
  id: string
  parentId?: Null<string>
  seq?: number
  timestamp?: number
  type: string
  message?: unknown
  summary?: string
}

/** Whether a file is one of the previous Alpha's: its first line is a header of another shape. */
export function isLegacySession(text: string): boolean {
  const first = text.split('\n', 1)[0] ?? ''
  try {
    const header = JSON.parse(first) as { v?: unknown; kind?: unknown; type?: unknown }
    return header.type !== 'session' && typeof header.v === 'number'
  } catch {
    return false
  }
}

/**
 * An old file, turned into the agent's format: the same entries, in the same tree, in the order
 * they were written. Only what a transcript is made of comes across — messages, compactions and
 * branch summaries — because a session the agent opens is a conversation, not a store.
 */
export function importLegacySession(text: string): Undef<string> {
  const lines = text.split('\n').filter((line) => line.trim() !== '')
  const header = parse<{ id?: unknown; cwd?: unknown; createdAt?: unknown }>(lines[0] ?? '')
  if (header?.id === undefined || typeof header.id !== 'string') return undefined

  const entries = lines
    .slice(1)
    .flatMap(writesIn)
    .flatMap(entryIn)
    .sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0))
  const agent = {
    type: 'session',
    version: 3,
    id: header.id,
    timestamp: stamp(header.createdAt),
    cwd: header.cwd ?? '',
  }
  const kept = entries.map((entry) => ({
    type: entry.type,
    id: entry.id,
    parentId: entry.parentId ?? null,
    timestamp: stamp(entry.timestamp),
    ...(entry.message === undefined ? {} : { message: entry.message }),
    ...(entry.summary === undefined ? {} : { summary: entry.summary }),
  }))
  return `${[agent, ...kept].map((one) => JSON.stringify(one)).join('\n')}\n`
}

/** A line of an old file is one write or a transaction of them; only entries are interesting. */
const writesIn = (line: string): Array<{ kind?: unknown; [field: string]: unknown }> => {
  const parsed = parse<unknown>(line)
  const writes = Array.isArray(parsed) ? parsed : [parsed]
  return writes.filter((write): write is { kind?: unknown } => typeof write === 'object' && write !== null)
}

function entryIn(write: { kind?: unknown; [field: string]: unknown }): LegacyEntry[] {
  if (write.kind !== 'entry') return []
  const entry = write as unknown as LegacyEntry
  if (typeof entry.id !== 'string') return []
  if (entry.type !== 'message' && entry.type !== 'compaction' && entry.type !== 'branch_summary') return []
  if (entry.type === 'message' && entry.message === undefined) return []
  return [entry]
}

const parse = <T>(line: string): Undef<T> => {
  try {
    return JSON.parse(line) as T
  } catch {
    return undefined
  }
}

const stamp = (value: unknown): string => {
  const milliseconds = typeof value === 'number' ? value : Date.now()
  return new Date(milliseconds).toISOString()
}

/**
 * Makes sure the session directory holds a file the agent can open for this conversation. An old
 * file with the conversation's id is copied under the same id, which is what the agent looks for by
 * name; a conversation that already has an agent-written session is left alone.
 */
export function importLegacySessionIn(directory: string, conversationId: string): void {
  if (!existsSync(directory)) return
  const files = readdirSync(directory).filter((name) => name.endsWith(`_${conversationId}.jsonl`))
  if (files.length === 0) return
  for (const name of files) {
    const path = join(directory, name)
    const text = readFileSync(path, 'utf-8')
    if (!isLegacySession(text)) continue
    const imported = importLegacySession(text)
    if (imported === undefined) continue
    // A new name, a new file: the one the person already has is not touched.
    writeFileSync(
      join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}_${conversationId}.jsonl`),
      imported,
    )
  }
}
