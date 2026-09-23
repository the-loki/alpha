/**
 * The conversation's own store: an append-only JSONL of entries per session, written as the run
 * produces them, read back as the transcript the window draws.
 *
 * The entry shapes are the ones the RPC era already parsed — messages, compactions and branch
 * summaries in an `id`/`parentId` tree, the tip naming the path a transcript is — so the read side
 * (`tipPath`, `entriesToMessages`) is carried over unchanged, and a session the old agent wrote is
 * read in place by the same parser: only the header line differs, and the header is skipped. What
 * changed is ownership: the writer is Alpha's, and no agent is asked for its own file.
 */

import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ChatMessage,
  EMPTY_USAGE,
  type Null,
  recordOf,
  type Undef,
  type UsageTotals,
  usageTotals,
} from '@alpha/domain'
import type { DecisionLookup } from './decisions.ts'
import { type AgentEntry, entriesToMessages } from './transcript-entries.ts'

/** The header line Alpha writes; the one the RPC-era agent wrote is recognized alongside it. */
const HEADER_TYPE = 'alpha-session'

/** pi's rule for naming a workspace's session folder, kept so existing folders are found. */
export function sessionDirectoryFor(sessionsRoot: string, workspacePath: string): string {
  const slug = workspacePath.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')
  return `${sessionsRoot}/--${slug}--`
}

/** The file name for one session: a timestamp so forks never overwrite, then the session's id. */
const fileName = (sessionId: string, now: number): string =>
  `${new Date(now).toISOString().replace(/[:.]/g, '-')}_${sessionId}.jsonl`

/** The file a session id names, the newest when a legacy import left more than one. */
export function findSessionFile(directory: string, sessionId: string): Undef<string> {
  if (!existsSync(directory)) return undefined
  const found = readdirSync(directory)
    .filter((name) => name.endsWith(`_${sessionId}.jsonl`))
    .sort()
  const newest = found.at(-1)
  return newest === undefined ? undefined : join(directory, newest)
}

/** One entry as it arrived off the disk, with only the fields a transcript is made of. */
const entryOf = (raw: unknown): Undef<AgentEntry> => {
  const entry = recordOf(raw)
  if (typeof entry.id !== 'string' || typeof entry.type !== 'string') return undefined
  return {
    type: entry.type,
    id: entry.id,
    parentId: typeof entry.parentId === 'string' ? entry.parentId : null,
    timestamp:
      typeof entry.timestamp === 'string' || typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
    ...(recordOf(entry.message).role === undefined ? {} : { message: entry.message as AgentEntry['message'] }),
    ...(typeof entry.summary === 'string' ? { summary: entry.summary } : {}),
    ...(typeof entry.firstKeptEntryId === 'string' ? { firstKeptEntryId: entry.firstKeptEntryId } : {}),
  }
}

/** Every entry in the file, plus where its tip is. A header line, whoever wrote it, is skipped. */
export function parseSession(text: string): { entries: AgentEntry[]; leafId: Null<string> } {
  const entries: AgentEntry[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const kind = recordOf(parsed).type
    if (kind === HEADER_TYPE || kind === 'session') continue
    const entry = entryOf(parsed)
    if (entry !== undefined) entries.push(entry)
  }
  return { entries, leafId: entries.at(-1)?.id ?? null }
}

/**
 * The path from the tip back to the root, in order: what a transcript is. Entries whose parent is
 * not on the path — a branch that was left behind — are not part of it.
 */
export function tipPath(entries: AgentEntry[], leafId: Null<string>): AgentEntry[] {
  if (leafId === null) return []
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const path: AgentEntry[] = []
  let current = byId.get(leafId)
  while (current !== undefined) {
    path.push(current)
    const parentId = current.parentId ?? null
    current = parentId === null ? undefined : byId.get(parentId)
    // A session that points at itself would otherwise loop forever.
    if (path.length > entries.length) break
  }
  const ordered = path.reverse()
  return ordered.map((entry) => standInFor(ordered, entry))
}

/**
 * A compaction stands in for the messages before the first entry the agent kept. When it kept
 * nothing — the summary covers everything said so far — it stands in for all of them, and the
 * entry it was written to is where the kept part begins.
 */
function standInFor(path: AgentEntry[], entry: AgentEntry): AgentEntry {
  if (entry.type !== 'compaction') return entry
  const written = path.findIndex((one) => one.id === entry.id)
  if (written === -1) return entry
  const found = entry.firstKeptEntryId === undefined ? -1 : path.findIndex((one) => one.id === entry.firstKeptEntryId)
  const kept = found === -1 ? written : found
  return { ...entry, replaced: path.slice(0, kept).filter((one) => one.type === 'message').length }
}

/** What the session has spent: what its assistants reported, added up along the path. */
export function usageOf(entries: AgentEntry[]): UsageTotals {
  return entries.reduce((total, entry) => {
    if (entry.type !== 'message' || entry.message?.role !== 'assistant') return total
    const reported = usageTotals(recordOf(entry.message).usage)
    return {
      input: total.input + reported.input,
      output: total.output + reported.output,
      cacheRead: total.cacheRead + reported.cacheRead,
      cacheWrite: total.cacheWrite + reported.cacheWrite,
      totalTokens: total.totalTokens + reported.totalTokens,
      cost: total.cost + reported.cost,
    }
  }, EMPTY_USAGE)
}

/** What a new entry carries, as the caller saw it happen. */
export interface NewEntry {
  type: string
  message?: AgentEntry['message']
  summary?: string
  firstKeptEntryId?: string
}

/** The store: one file per session, written the moment an entry exists. */
export class SessionStore {
  readonly #root: string
  readonly #tips = new Map<string, Null<string>>()

  constructor(root: string) {
    this.#root = root
  }

  /** Reads a session: every entry in its file, and where its tip is. */
  entries(sessionId: string, workspacePath: string): { entries: AgentEntry[]; leafId: Null<string> } {
    const file = findSessionFile(sessionDirectoryFor(this.#root, workspacePath), sessionId)
    if (file === undefined) return { entries: [], leafId: null }
    return parseSession(readFileSync(file, 'utf-8'))
  }

  transcript(sessionId: string, workspacePath: string, decisions?: DecisionLookup): ChatMessage[] {
    const { entries, leafId } = this.entries(sessionId, workspacePath)
    return entriesToMessages(tipPath(entries, leafId), decisions)
  }

  usage(sessionId: string, workspacePath: string): UsageTotals {
    const { entries, leafId } = this.entries(sessionId, workspacePath)
    return usageOf(tipPath(entries, leafId))
  }

  /** The user's own messages, in order: what a resend or a fork works from. */
  userEntries(sessionId: string, workspacePath: string): AgentEntry[] {
    const { entries, leafId } = this.entries(sessionId, workspacePath)
    return tipPath(entries, leafId).filter((entry) => entry.type === 'message' && entry.message?.role === 'user')
  }

  /**
   * Appends one entry and answers it as it now stands: identified, chained to the tip, on the
   * disk. The caller says what happened; the store says where it went.
   */
  append(options: { sessionId: string; workspacePath: string; entry: NewEntry }): AgentEntry {
    const directory = sessionDirectoryFor(this.#root, options.workspacePath)
    mkdirSync(directory, { recursive: true })
    const file = findSessionFile(directory, options.sessionId) ?? this.#createFile(options)
    if (!this.#tips.has(options.sessionId)) {
      this.#tips.set(options.sessionId, this.entries(options.sessionId, options.workspacePath).leafId)
    }
    const entry: AgentEntry = {
      type: options.entry.type,
      id: randomBytes(4).toString('hex'),
      parentId: this.#tips.get(options.sessionId) ?? null,
      timestamp: new Date().toISOString(),
      ...(options.entry.message === undefined ? {} : { message: options.entry.message }),
      ...(options.entry.summary === undefined ? {} : { summary: options.entry.summary }),
      ...(options.entry.firstKeptEntryId === undefined ? {} : { firstKeptEntryId: options.entry.firstKeptEntryId }),
    }
    appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf-8')
    this.#tips.set(options.sessionId, entry.id)
    return entry
  }

  /** A compaction, written where the summary stands in for what came before it. */
  compact(options: {
    sessionId: string
    workspacePath: string
    summary: string
    firstKeptEntryId?: string
  }): AgentEntry {
    return this.append({
      sessionId: options.sessionId,
      workspacePath: options.workspacePath,
      entry: {
        type: 'compaction',
        summary: options.summary,
        ...(options.firstKeptEntryId === undefined ? {} : { firstKeptEntryId: options.firstKeptEntryId }),
      },
    })
  }

  /**
   * Copies the path before an entry into a session of its own, which is how a branch tip moves:
   * what was replaced stays in the file it was written to, and the copy is where the conversation
   * carries on. The answer is the copy's id, or nothing when there is no such entry.
   */
  fork(sessionId: string, workspacePath: string, entryId: string): Undef<string> {
    const { entries, leafId } = this.entries(sessionId, workspacePath)
    const path = tipPath(entries, leafId)
    const at = path.findIndex((entry) => entry.id === entryId)
    if (at === -1) return undefined
    const copyId = randomBytes(4).toString('hex')
    const directory = sessionDirectoryFor(this.#root, workspacePath)
    mkdirSync(directory, { recursive: true })
    const header = `${JSON.stringify({
      type: HEADER_TYPE,
      version: 1,
      id: copyId,
      timestamp: new Date().toISOString(),
      cwd: workspacePath,
    })}\n`
    writeFileSync(
      join(directory, fileName(copyId, Date.now())),
      `${header}${path
        .slice(0, at)
        .map((entry) => `${JSON.stringify(entry)}\n`)
        .join('')}`,
      'utf-8',
    )
    this.#tips.set(copyId, path[at - 1]?.id ?? null)
    return copyId
  }

  /** Taking a session off the disk: a deleted conversation is deleted, not hidden. */
  remove(sessionId: string, workspacePath: string): void {
    const file = findSessionFile(sessionDirectoryFor(this.#root, workspacePath), sessionId)
    if (file !== undefined) rmSync(file, { force: true })
    this.#tips.delete(sessionId)
  }

  /** A session with no file yet gets one: the header line is its whole creation. */
  #createFile(options: { sessionId: string; workspacePath: string }): string {
    const file = join(sessionDirectoryFor(this.#root, options.workspacePath), fileName(options.sessionId, Date.now()))
    writeFileSync(
      file,
      `${JSON.stringify({
        type: HEADER_TYPE,
        version: 1,
        id: options.sessionId,
        timestamp: new Date().toISOString(),
        cwd: options.workspacePath,
      })}\n`,
      'utf-8',
    )
    this.#tips.set(options.sessionId, null)
    return file
  }
}

/** Which session a conversation is on: its own id until a fork gives it one of the agent's. */
export const sessionIdOf = (conversation: { id: string; sessionId?: string }): string =>
  conversation.sessionId ?? conversation.id
