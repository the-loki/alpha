/**
 * Reading a conversation: what it says, what it has spent, and the user's own messages. Every read
 * is addressed by the conversation's id, so what a caller has to know is an id and nothing else:
 * which session the conversation is on now, and where that session's workspace is, is this file's
 * business.
 *
 * The session is the one the conversation records (`sessionIdOf`), which is also the one a run
 * writes to: a fork moves the tip, and the copy's id is written to the conversation at that moment,
 * so the record and the running session are the same fact by construction rather than two that have
 * to be kept in step. A conversation that is open and one that was last opened yesterday are read
 * the same way, which is why there is no branch here for either.
 *
 * The reads are the store's own, and the store is the file a run writes as it goes: this is a face
 * over it, addressed by conversation instead of by session.
 */
import type { ChatMessage, Undef, UsageTotals } from '@alpha/domain'
import type { DecisionLookup } from './decisions.ts'
import { type SessionStore, sessionIdOf } from './sessions.ts'
import type { AgentEntry } from './transcript-entries.ts'

/** Where a conversation's record is: the session it is on, and where that session's workspace is. */
export interface ConversationAddress {
  id: string
  sessionId?: string
  workspacePath: string
}

export interface ConversationReadsOptions {
  /** The conversation, by id. Throws when there is no such conversation. */
  conversation: (id: string) => ConversationAddress
  store: SessionStore
  /** How earlier calls got past the gate, for the rows in a rendered transcript (decisions.ts). */
  decisions?: (id: string) => Undef<DecisionLookup>
}

export class ConversationReads {
  private readonly sources: ConversationReadsOptions

  public constructor(sources: ConversationReadsOptions) {
    this.sources = sources
  }

  /** The conversation as it stands: what a window just opening it draws. */
  public transcript(id: string): ChatMessage[] {
    const address = this.sources.conversation(id)
    return this.sources.store.transcript(sessionIdOf(address), address.workspacePath, this.sources.decisions?.(id))
  }

  /** What the conversation has spent so far, which is what a window opening it has to show. */
  public usage(id: string): UsageTotals {
    const address = this.sources.conversation(id)
    return this.sources.store.usage(sessionIdOf(address), address.workspacePath)
  }

  /** The user's own messages, in order: what a resend, an edit or a fork works from. */
  public userEntries(id: string): AgentEntry[] {
    const address = this.sources.conversation(id)
    return this.sources.store.userEntries(sessionIdOf(address), address.workspacePath)
  }
}
