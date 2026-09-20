/**
 * Reading a conversation's session: the one module that knows what is in a transcript.
 *
 * The agent writes the session; this reads it back over the protocol (the same pipe the runs go
 * down), so Alpha never parses a file it does not own. What it reads is the *path* from the
 * branch's tip back to its root rather than the whole log: answering a message again leaves the
 * answer it replaced in the session as history, and the transcript is the path, not the log. That
 * rule lives here rather than at every call site (#60).
 */

import { type ChatMessage, EMPTY_USAGE, type Null, type Undef, type UsageTotals } from '@alpha/core'
import type { AgentRpc } from '../agent-cli/rpc.ts'
import type { DecisionLookup } from './decisions.ts'
import { type AgentEntry, entriesToMessages } from './transcript-entries.ts'

/** What `get_entries` answers with: every entry the session holds, and where its tip is. */
interface EntriesAnswer {
  entries: AgentEntry[]
  leafId: Null<string>
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const entryOf = (raw: unknown): AgentEntry => {
  const entry = record(raw)
  return {
    type: typeof entry.type === 'string' ? entry.type : '',
    id: typeof entry.id === 'string' ? entry.id : '',
    parentId: typeof entry.parentId === 'string' ? entry.parentId : null,
    timestamp:
      typeof entry.timestamp === 'string' || typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
    ...(record(entry.message).role === undefined ? {} : { message: entry.message as AgentEntry['message'] }),
    ...(typeof entry.summary === 'string' ? { summary: entry.summary } : {}),
    ...(typeof entry.firstKeptEntryId === 'string' ? { firstKeptEntryId: entry.firstKeptEntryId } : {}),
  }
}

/**
 * The path from the branch's tip back to its root, in order: what a transcript is. Entries whose
 * parent is not in the path (a branch that was left behind) are not part of it.
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

/** Reads a conversation: its transcript, what it has spent, and where its session lives. */
export class SessionReader {
  readonly #rpc: AgentRpc
  readonly #decisions: DecisionLookup

  constructor(rpc: AgentRpc, decisions: DecisionLookup = new Map()) {
    this.#rpc = rpc
    this.#decisions = decisions
  }

  async transcript(): Promise<ChatMessage[]> {
    const answer = await this.#entries()
    return entriesToMessages(tipPath(answer.entries, answer.leafId), this.#decisions)
  }

  /** What the session has spent so far, which is what a window opening it has to show. */
  async usage(): Promise<UsageTotals> {
    const outcome = await this.#rpc.send({ type: 'get_session_stats' })
    if (!outcome.ok) return EMPTY_USAGE
    return usageOf(record(outcome.data).usage)
  }

  /** The user's own messages, in order: what a resend or a fork works from. */
  async userEntries(): Promise<AgentEntry[]> {
    const answer = await this.#entries()
    return tipPath(answer.entries, answer.leafId).filter(
      (entry) => entry.type === 'message' && entry.message?.role === 'user',
    )
  }

  /**
   * Branches the session before an entry, which is how a branch tip moves: the agent copies what
   * came before the entry into a session of its own and carries on there. What was replaced stays
   * in the session it was written to. The answer is the id of the copy, or nothing when the agent
   * would not fork.
   */
  async forkAt(entryId: string): Promise<Undef<string>> {
    const outcome = await this.#rpc.send({ type: 'fork', entryId })
    if (!outcome.ok) return undefined
    const sessionId = (await this.#state()).sessionId
    return sessionId === '' ? undefined : sessionId
  }

  /** Which session the agent is on, as it names it. */
  async sessionId(): Promise<string> {
    return (await this.#state()).sessionId
  }

  /** Where the session is, which is what the agent's own `sessionFile` answer is for. */
  async file(): Promise<string> {
    return (await this.#state()).file
  }

  async #state(): Promise<{ sessionId: string; file: string }> {
    const outcome = await this.#rpc.send({ type: 'get_state' })
    const data = record(outcome.data)
    return {
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : '',
      file: typeof data.sessionFile === 'string' ? data.sessionFile : '',
    }
  }

  /** The whole log, for the one caller that needs to see past the tip: forking. */
  async log(): Promise<EntriesAnswer> {
    return this.#entries()
  }

  async #entries(): Promise<EntriesAnswer> {
    const outcome = await this.#rpc.send({ type: 'get_entries' })
    const data = record(outcome.data)
    return {
      entries: listOf(data.entries).map(entryOf),
      leafId: typeof data.leafId === 'string' ? data.leafId : null,
    }
  }
}

/** pi's numbers in the workbench's terms: the shape is core's, the mapping is this file's. */
export function usageOf(usage: unknown): UsageTotals {
  const numbers = record(usage)
  const cost = record(numbers.cost)
  const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  return {
    input: count(numbers.input),
    output: count(numbers.output),
    cacheRead: count(numbers.cacheRead),
    cacheWrite: count(numbers.cacheWrite),
    totalTokens: count(numbers.totalTokens),
    cost: count(cost.total),
  }
}
