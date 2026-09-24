import type { OpenedConversation } from '@alpha/contract'
import { type ConversationBookkeeper, newConversation } from '@alpha/conversations'
import {
  type ConversationSummary,
  defaultLevelFor,
  EMPTY_USAGE,
  type McpElicitationRequest,
  type McpExchange,
} from '@alpha/domain'
import { defaultModel } from '@alpha/providers'
import type { ConversationReads, WorkspaceChangeLog } from '@alpha/sessions'
import type { RuntimeManagerOptions } from './managed-runtime.ts'

/** Creates the conversation before any message exists, then returns its first window state. */
export async function createOpenedConversation(
  workspacePath: string,
  options: RuntimeManagerOptions,
  books: ConversationBookkeeper,
  launch: (conversation: ConversationSummary) => Promise<unknown>,
): Promise<OpenedConversation> {
  const conversation = newConversation({
    id: crypto.randomUUID(),
    workspacePath,
    now: Date.now(),
    permissionLevel: defaultLevelFor(options.store.read(), workspacePath),
    model: defaultModel(options.providers),
  })
  await launch(conversation)
  books.upsert(conversation)
  options.store.rememberConversation(conversation.id)
  return { conversation, messages: [], usage: EMPTY_USAGE, workspaceChanges: [], mcpExchanges: [], mcpPending: [] }
}

export interface McpConversationReads {
  records(id: string): McpExchange[]
  pending(id: string): McpElicitationRequest[]
}

/** The one complete snapshot handed to a reopened window or browser conversation. */
export function openedConversation(
  conversation: ConversationSummary,
  reads: ConversationReads,
  changes: WorkspaceChangeLog,
  mcp: McpConversationReads,
): OpenedConversation {
  return {
    conversation,
    messages: reads.transcript(conversation.id),
    usage: reads.usage(conversation.id),
    workspaceChanges: changes.list(conversation.id),
    mcpExchanges: mcp.records(conversation.id),
    mcpPending: mcp.pending(conversation.id),
  }
}
