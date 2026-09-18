/**
 * The conversation list, as the window sees it: titles, ordering, and which workspace each
 * conversation belongs to. The transcript's record of truth is the JSONL session (ADR-0004);
 * this index is the cheap read that makes the sidebar a single file read instead of one session
 * open per conversation.
 */
import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'
import type { ConversationSummary } from './runtime-events.ts'

const ConversationSummarySchema = Type.Object({
  id: Type.String(),
  workspacePath: Type.String(),
  title: Type.String(),
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
  status: Type.Union([Type.Literal('idle'), Type.Literal('running')]),
})

const ConversationIndexSchema = Type.Object({
  version: Type.Literal(1),
  conversations: Type.Array(ConversationSummarySchema),
})

type IndexShape = Static<typeof ConversationIndexSchema>

export interface ConversationIndex {
  version: 1
  conversations: ConversationSummary[]
}

export function emptyConversationIndex(): ConversationIndex {
  return { version: 1, conversations: [] }
}

/** A file that does not match is treated as absent, for the same reason the workbench state is. */
export function parseConversationIndex(raw: unknown): ConversationIndex {
  const candidate = typeof raw === 'string' ? parseJson(raw) : raw
  if (!Value.Check(ConversationIndexSchema, candidate)) return emptyConversationIndex()
  const index: IndexShape = candidate
  return { version: 1, conversations: index.conversations }
}

export function listForWorkspace(index: ConversationIndex, workspacePath: string): ConversationSummary[] {
  return index.conversations
    .filter((conversation) => conversation.workspacePath === workspacePath)
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export function upsertConversation(index: ConversationIndex, conversation: ConversationSummary): ConversationIndex {
  const others = index.conversations.filter((existing) => existing.id !== conversation.id)
  return { version: 1, conversations: [conversation, ...others] }
}

export function removeConversation(index: ConversationIndex, id: string): ConversationIndex {
  return { version: 1, conversations: index.conversations.filter((conversation) => conversation.id !== id) }
}

export function findConversation(index: ConversationIndex, id: string): ConversationSummary | undefined {
  return index.conversations.find((conversation) => conversation.id === id)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
