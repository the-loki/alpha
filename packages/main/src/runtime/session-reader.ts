/**
 * Reading a conversation's session: the one module that knows what is in a transcript.
 *
 * A session holds more than the conversation. Answering a message again moves the branch tip and
 * leaves the answer it replaced in the log as history, so the transcript is the path from the tip
 * back to the root — and that rule lives here rather than at every call site. Three readers with
 * two rules is how a discarded answer comes back after a relaunch (#60).
 */
import { type Absent, type ChatMessage, EMPTY_USAGE, type UsageTotals } from '@alpha/core'
import {
  BACKGROUND_CONTEXT,
  type Entry,
  type JsonlSessionMetadata,
  JsonlSessionRepo,
  type Session,
} from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import type { DecisionLookup } from './decisions.ts'
import { entriesToMessages } from './transcript-entries.ts'

export interface SessionLocation {
  sessionsRoot: string
  workspacePath: string
  conversationId: string
}

/**
 * The path from the branch's tip back to its root, in order: what a transcript is. Exported for
 * the one caller that navigates the branch itself (editing, resending), not for reading.
 */
export async function tipPathOf(session: Session<JsonlSessionMetadata>): Promise<Entry[]> {
  const branch = await session.branch('main', BACKGROUND_CONTEXT)
  if (branch === undefined) return []
  const tip = await branch.getTipId(BACKGROUND_CONTEXT)
  if (tip === null) return []
  return branch.findEntries({ start: tip, order: 'oldestFirst' }, BACKGROUND_CONTEXT)
}

/** pi's usage in the workbench's terms: the totals module owns the shape, this owns the mapping. */
export function usageOf(usage: {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: { total: number }
}): UsageTotals {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: usage.cost.total,
  }
}

/**
 * A conversation's session, open for reading. Wrapping it this way is what keeps the tip-path
 * rule out of callers' hands: there is no method here that reads the whole log.
 */
export class SessionReader {
  readonly #session: Session<JsonlSessionMetadata>
  readonly #decisions: DecisionLookup
  readonly #ownsSession: boolean

  constructor(session: Session<JsonlSessionMetadata>, options: { decisions?: DecisionLookup; owns?: boolean } = {}) {
    this.#session = session
    this.#decisions = options.decisions ?? new Map()
    this.#ownsSession = options.owns ?? false
  }

  /** The session itself, for the harness the runtime builds on top of it. */
  get session(): Session<JsonlSessionMetadata> {
    return this.#session
  }

  async transcript(): Promise<ChatMessage[]> {
    return entriesToMessages(await tipPathOf(this.#session), this.#decisions)
  }

  async usage(): Promise<UsageTotals> {
    const stats = await this.#session.getStats(BACKGROUND_CONTEXT)
    return usageOf(stats.usage)
  }

  /** The entry a compaction wrote its summary into, for the marker the window shows. */
  async entry(entryId: string): Promise<Absent<Entry>> {
    return this.#session.getEntry(entryId, BACKGROUND_CONTEXT)
  }

  /** Closes the session when this reader opened it; a session owned by a runtime is the runtime's. */
  async close(): Promise<void> {
    if (!this.#ownsSession) return
    await this.#session.close(BACKGROUND_CONTEXT)
  }
}

const repoAt = (location: SessionLocation): JsonlSessionRepo =>
  new JsonlSessionRepo({
    fileSystem: new NodeExecutionEnv({ cwd: location.workspacePath }),
    sessionsRoot: location.sessionsRoot,
  })

/** Finds the session a conversation is stored in, so it can be reopened after a restart. */
export async function findSessionMetadata(location: SessionLocation): Promise<Absent<JsonlSessionMetadata>> {
  const repo = repoAt(location)
  const sessions = await repo.list({ cwd: location.workspacePath }, BACKGROUND_CONTEXT)
  return sessions.find((metadata) => metadata.id === location.conversationId)
}

/**
 * Opens the session a conversation is stored in. A conversation that has never run has none, and
 * the caller is told so (`undefined`) rather than handed an empty session it might write into —
 * unless it asked for one, which is what starting a conversation does. A new session is created
 * under the id it was asked for, so the conversation's id is the one its file is named after.
 */
export async function openSession(
  location: SessionLocation,
  options: { create?: boolean; decisions?: DecisionLookup } = {},
): Promise<Absent<SessionReader>> {
  const repo = repoAt(location)
  const metadata = await findSessionMetadata(location)
  if (metadata !== undefined) {
    const session = await repo.open(metadata, BACKGROUND_CONTEXT)
    return new SessionReader(session, { decisions: options.decisions, owns: true })
  }
  if (options.create !== true) return undefined
  const session = await repo.create({ cwd: location.workspacePath, id: location.conversationId }, BACKGROUND_CONTEXT)
  return new SessionReader(session, { decisions: options.decisions, owns: true })
}

/** Opens a session, reads from it, and closes it again: what every caller outside the runtime does. */
export async function withSession<T>(
  location: SessionLocation,
  read: (reader: SessionReader) => Promise<T>,
  absent: T,
  options: { decisions?: DecisionLookup } = {},
): Promise<T> {
  const reader = await openSession(location, options)
  if (reader === undefined) return absent
  try {
    return await read(reader)
  } finally {
    await reader.close()
  }
}

/** What a conversation that is not running has spent. */
export async function sessionUsage(location: SessionLocation): Promise<UsageTotals> {
  return withSession(location, (reader) => reader.usage(), EMPTY_USAGE)
}

/** Takes the session off the disk. A conversation that is deleted is deleted, not hidden. */
export async function deleteSession(location: SessionLocation): Promise<void> {
  const metadata = await findSessionMetadata(location)
  if (metadata === undefined) return
  const repo = repoAt(location)
  await repo.delete(metadata, BACKGROUND_CONTEXT)
  await repo.close(BACKGROUND_CONTEXT)
}
