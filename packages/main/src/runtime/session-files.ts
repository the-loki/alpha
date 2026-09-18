/**
 * The conversation's own files: where its transcript lives, what it has spent, deleting it, and
 * writing it out as markdown. Everything here works from the session store alone, so it can be
 * used for a conversation that is open and for one that is not.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ChatMessage,
  type ConversationSummary,
  EMPTY_USAGE,
  exportFileName,
  exportMarkdown,
  type UsageTotals,
} from '@alpha/core'
import { BACKGROUND_CONTEXT, JsonlSessionRepo } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { findSessionMetadata, readTranscript } from './conversation-runtime.ts'

export interface SessionLocation {
  sessionsRoot: string
  workspacePath: string
  conversationId: string
}

async function openRepo(location: SessionLocation): Promise<JsonlSessionRepo> {
  const repo = new JsonlSessionRepo({
    fileSystem: new NodeExecutionEnv({ cwd: location.workspacePath }),
    sessionsRoot: location.sessionsRoot,
  })
  return repo
}

/** What a conversation that is not running has spent, read straight from its session. */
export async function readSessionUsage(location: SessionLocation): Promise<UsageTotals> {
  const metadata = await findSessionMetadata(location)
  if (metadata === undefined) return EMPTY_USAGE
  const repo = await openRepo(location)
  const session = await repo.open(metadata, BACKGROUND_CONTEXT)
  const stats = await session.getStats(BACKGROUND_CONTEXT)
  await session.close(BACKGROUND_CONTEXT)
  return {
    input: stats.usage.input,
    output: stats.usage.output,
    cacheRead: stats.usage.cacheRead,
    cacheWrite: stats.usage.cacheWrite,
    totalTokens: stats.usage.totalTokens,
    cost: stats.usage.cost.total,
  }
}

/** Takes the transcript off the disk. A conversation that is deleted is deleted, not hidden. */
export async function deleteSession(location: SessionLocation): Promise<void> {
  const metadata = await findSessionMetadata(location)
  if (metadata === undefined) return
  const repo = await openRepo(location)
  await repo.delete(metadata, BACKGROUND_CONTEXT)
  await repo.close(BACKGROUND_CONTEXT)
}

export async function readSessionTranscript(location: SessionLocation): Promise<ChatMessage[]> {
  return readTranscript({
    sessionsRoot: location.sessionsRoot,
    workspacePath: location.workspacePath,
    conversationId: location.conversationId,
  })
}

/** Writes the conversation beside its workspace, and answers with where it went. */
export function writeSessionMarkdown(conversation: ConversationSummary, messages: ChatMessage[]): { path: string } {
  const path = join(conversation.workspacePath, exportFileName(conversation.title))
  writeFileSync(path, exportMarkdown(conversation, messages), 'utf-8')
  return { path }
}
