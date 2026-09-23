/**
 * The history an agent starts with, built from the session's entries. The entries on the tip path
 * are pi-ai messages already — the store wrote them as the run produced them — so a message entry
 * crosses verbatim, and a compaction is the one structural change: it stands in for everything
 * before it, which becomes a single user message carrying the summary, with the entries after it
 * kept as they were. That is coding-agent's buildContext, simplified to the two shapes Alpha
 * writes.
 *
 * The fold is also where the entry ids stay aligned with the messages: the compaction plugin asks
 * for the id of the first message a new summary leaves standing, so a reopened conversation folds
 * exactly the way the live one was rewritten.
 */

import type { Undef } from '@alpha/domain'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AgentEntry } from './transcript-entries.ts'

/** Whether an entry is a summary standing in for the messages before it. */
const isSummary = (entry: AgentEntry): boolean => entry.type === 'compaction' || entry.type === 'branch_summary'

/** The messages of a history, and the store entry each one came from. */
export interface AlignedHistory {
  messages: AgentMessage[]
  /** The entry each message came from; a summary standing in for older messages has none. */
  entryIds: Undef<string>[]
}

export function alignedHistoryOf(entries: AgentEntry[]): AlignedHistory {
  const messages: AgentMessage[] = []
  const entryIds: Undef<string>[] = []
  for (const entry of entries) {
    if (isSummary(entry)) {
      const carried: AgentMessage = {
        role: 'user',
        content: [{ type: 'text', text: entry.summary ?? '' }],
        timestamp: Date.now(),
      }
      messages.length = 0
      entryIds.length = 0
      messages.push(carried)
      entryIds.push(undefined)
      continue
    }
    if (entry.type === 'message' && entry.message !== undefined) {
      messages.push(entry.message as AgentMessage)
      entryIds.push(entry.id)
    }
  }
  return { messages, entryIds }
}

export function contextOf(entries: AgentEntry[]): AgentMessage[] {
  return alignedHistoryOf(entries).messages
}
