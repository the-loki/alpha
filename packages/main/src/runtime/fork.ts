/**
 * Forking a conversation: a new session carrying everything before an entry, so an edited message
 * can be tried again without the original losing anything. The copy is the session store's job —
 * what belongs here is the bookkeeping that makes it a conversation the window can open.
 */

import { type ConversationSummary, titleFromMessage } from '@alpha/core'
import { BACKGROUND_CONTEXT, type JsonlSessionMetadata, JsonlSessionRepo } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'

export async function forkConversation(options: {
  /** The session to copy, as the store knows it — not as the window remembers it. */
  source: JsonlSessionMetadata
  conversation: ConversationSummary
  /** The entry to fork before: the fork stops at its parent. */
  entryId: string
  /** The message the new conversation starts with, which also gives it its title. */
  text: string
  sessionsRoot: string
}): Promise<ConversationSummary> {
  const env = new NodeExecutionEnv({ cwd: options.conversation.workspacePath })
  const repo = new JsonlSessionRepo({ fileSystem: env, sessionsRoot: options.sessionsRoot })
  const forked = await repo.fork(
    options.source,
    { scope: 'branch', branch: 'main', entryId: options.entryId, position: 'before' },
    BACKGROUND_CONTEXT,
  )
  const now = Date.now()
  await forked.close(BACKGROUND_CONTEXT)
  return {
    ...options.conversation,
    id: forked.metadata.id,
    title: titleFromMessage(options.text),
    createdAt: now,
    updatedAt: now,
    status: 'idle',
  }
}
