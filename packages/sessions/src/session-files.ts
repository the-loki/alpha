/**
 * The conversation's own files, for what is done to one rather than read out of it: forking a
 * conversation without disturbing the one on screen, and writing it out as markdown. What is read
 * back — the transcript, the usage, the user's own messages — is `ConversationReads`. The store is
 * where a conversation lives now that Alpha owns its sessions, so nothing here asks an agent for
 * anything.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ChatMessage, type ConversationSummary, exportFileName, exportMarkdown, type Undef } from '@alpha/domain'
import { SessionStore, sessionIdOf } from './sessions.ts'

/**
 * Where the sessions are, and why a run is refused: the two things the workbench still needs to
 * know about providers now that the agent is embedded — the sessions root every read goes through,
 * and the sentence for a missing key (#114). The key itself is answered to the model runtime at
 * request time, never through this door (C2.4).
 */
export interface AgentPorts {
  sessionsRoot: string
  /** Why there is no key to dial with, when there is none (#114). Absent when there is one. */
  keyProblem: (providerId: string) => Undef<string>
}

/**
 * Branches a conversation's session before an entry, without touching the conversation that is
 * open. The fork is a plain file copy, so it goes through a store of its own over the same root —
 * what was replaced stays in the session it was written to, and the answer is the copy's id.
 */
export function forkSession(ports: AgentPorts, conversation: ConversationSummary, entryId: string): Undef<string> {
  return new SessionStore(ports.sessionsRoot).fork(sessionIdOf(conversation), conversation.workspacePath, entryId)
}

/** Writes the conversation beside its workspace, and answers with where it went. */
export function writeSessionMarkdown(conversation: ConversationSummary, messages: ChatMessage[]): { path: string } {
  const path = join(conversation.workspacePath, exportFileName(conversation.title))
  writeFileSync(path, exportMarkdown(conversation, messages), 'utf-8')
  return { path }
}
