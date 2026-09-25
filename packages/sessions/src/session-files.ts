/**
 * The conversation's own files, for what is done to one rather than read out of it: forking a
 * conversation without disturbing the one on screen, and writing it out as markdown. What is read
 * back — the transcript, the usage, the user's own messages — is `ConversationReads`. The store is
 * where a conversation lives now that Alpha owns its sessions, so nothing here asks an agent for
 * anything.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ChatMessage,
  type ConversationSummary,
  exportFileName,
  exportMarkdown,
  type McpExchange,
  type TurnRefusal,
  type Undef,
} from '@alpha/domain'
import { SessionStore, sessionIdOf } from './sessions.ts'

/**
 * Where the sessions are, and why a run is refused: the two things the workbench still needs to
 * know about providers now that the agent is embedded — the sessions root every read goes through,
 * and which key refusal stops a turn. The key itself is answered to the model runtime at
 * request time, never through this door (C2.4).
 */
export interface AgentPorts {
  sessionsRoot: string
  /** Which key refusal it is, when there is no key to dial with. Absent when there is one. */
  keyProblem: (providerId: string) => Undef<TurnRefusal>
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
export function writeSessionMarkdown(
  conversation: ConversationSummary,
  messages: ChatMessage[],
  exchanges: McpExchange[] = [],
): { path: string } {
  const path = join(conversation.workspacePath, exportFileName(conversation.title))
  const audit =
    exchanges.length === 0
      ? ''
      : [
          '## MCP requests',
          '',
          ...exchanges.flatMap((record) => [
            `### ${record.server} · ${record.method} · ${record.outcome}`,
            '',
            `Parent tool: ${record.toolName} (${record.toolCallId})`,
            `Requested: ${new Date(record.requestedAt).toISOString()}`,
            `Settled: ${record.settledAt === undefined ? 'pending' : new Date(record.settledAt).toISOString()}`,
            `Message: ${record.requestText}`,
            ...(record.content === undefined ? [] : [`Content: ${JSON.stringify(record.content)}`]),
            ...(record.model === undefined ? [] : [`Model: ${record.model.providerId} / ${record.model.modelId}`]),
            ...(record.submittedText === undefined ? [] : [`Prompt sent: ${record.submittedText}`]),
            ...(record.responseText === undefined ? [] : [`Response shared: ${record.responseText}`]),
            ...(record.usage === undefined
              ? []
              : [
                  `Usage: ${record.usage.totalTokens} tokens (${record.usage.input} input, ${record.usage.output} output), cost ${record.usage.cost}`,
                ]),
            '',
          ]),
        ].join('\n')
  writeFileSync(path, `${exportMarkdown(conversation, messages)}${audit}`, 'utf-8')
  return { path }
}
