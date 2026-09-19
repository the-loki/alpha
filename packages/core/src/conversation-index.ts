/**
 * The conversation list, as the window sees it: titles, ordering, and which workspace each
 * conversation belongs to. The transcript's record of truth is the JSONL session (ADR-0004);
 * this index is the cheap read that makes the sidebar a single file read instead of one session
 * open per conversation.
 */

import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'
import type { Undef } from './maybe.ts'
import { PERMISSION_LEVELS } from './permission.ts'
import type { ConversationSummary } from './runtime-events.ts'
import { THINKING_LEVELS } from './thinking.ts'
import { folderName, type WorkspaceRef } from './workspace.ts'

const ConversationSummarySchema = Type.Object({
  id: Type.String(),
  workspacePath: Type.String(),
  title: Type.String(),
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
  status: Type.Union([Type.Literal('idle'), Type.Literal('running'), Type.Literal('waiting')]),
  permissionLevel: Type.Union(PERMISSION_LEVELS.map((level) => Type.Literal(level))),
  model: Type.Object({ providerId: Type.String(), modelId: Type.String() }),
  thinkingLevel: Type.Union(THINKING_LEVELS.map((level) => Type.Literal(level))),
  // Absent means not archived, and it is optional on purpose: a required field would fail the
  // whole index on the first launch after an upgrade and empty the sidebar (ADR-0011's sibling
  // decision, ticket #79).
  archivedAt: Type.Optional(Type.Number()),
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

/** One folder in the sidebar, with the conversations that belong to it. */
export interface FolderNode {
  path: string
  name: string
  /** The newest thing that happened here: its newest conversation, or when it was last pointed at. */
  lastActiveAt: number
  conversations: ConversationSummary[]
}

/**
 * The sidebar's shape: every folder the workbench knows, each with its conversations, ordered by
 * the most recent thing that happened in it. Folders come from what is remembered *and* from what
 * has conversations, so a folder the workbench has forgotten — the recent list is short — does not
 * take its conversations with it. Grouping is by path, not by name, because two folders can share
 * a name and merging them would be a lie.
 *
 * Archived conversations are not here: they are a section of their own (see
 * `archivedConversations`), and a folder is not "recently active" because something in it was put
 * away.
 */
export function folderTree(recents: WorkspaceRef[], conversations: ConversationSummary[]): FolderNode[] {
  const folders = new Map<string, FolderNode>()
  for (const recent of recents) {
    folders.set(recent.path, {
      path: recent.path,
      name: recent.name,
      lastActiveAt: recent.lastOpenedAt,
      conversations: [],
    })
  }

  for (const conversation of conversations) {
    if (conversation.archivedAt !== undefined) continue
    const existing = folders.get(conversation.workspacePath)
    const folder: FolderNode = existing ?? {
      path: conversation.workspacePath,
      name: folderName(conversation.workspacePath),
      lastActiveAt: 0,
      conversations: [],
    }
    folder.conversations.push(conversation)
    folder.lastActiveAt = Math.max(folder.lastActiveAt, conversation.updatedAt)
    if (existing === undefined) folders.set(conversation.workspacePath, folder)
  }

  return [...folders.values()]
    .map((folder) => ({
      ...folder,
      conversations: [...folder.conversations].sort((left, right) => right.updatedAt - left.updatedAt),
    }))
    .sort((left, right) => right.lastActiveAt - left.lastActiveAt || left.name.localeCompare(right.name))
}

/** Everything put away, newest first: the sidebar's archived section, across every folder. */
export function archivedConversations(conversations: ConversationSummary[]): ConversationSummary[] {
  return conversations
    .filter((conversation) => conversation.archivedAt !== undefined)
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

/**
 * A conversation that is working, or waiting on an approval, is not offered for archiving: the
 * card asking for an answer lives inside its transcript, and folding that away would hide the one
 * thing that needs a person (ticket #79).
 */
export function canArchive(conversation: ConversationSummary): boolean {
  return conversation.status === 'idle'
}

export function archiveConversation(index: ConversationIndex, id: string, at: number): ConversationIndex {
  return mapConversation(index, id, (conversation) => ({ ...conversation, archivedAt: at }))
}

export function unarchiveConversation(index: ConversationIndex, id: string): ConversationIndex {
  return mapConversation(index, id, ({ archivedAt: _archived, ...conversation }) => conversation)
}

function mapConversation(
  index: ConversationIndex,
  id: string,
  change: (conversation: ConversationSummary) => ConversationSummary,
): ConversationIndex {
  return {
    version: 1,
    conversations: index.conversations.map((conversation) =>
      conversation.id === id ? change(conversation) : conversation,
    ),
  }
}

export function upsertConversation(index: ConversationIndex, conversation: ConversationSummary): ConversationIndex {
  const others = index.conversations.filter((existing) => existing.id !== conversation.id)
  return { version: 1, conversations: [conversation, ...others] }
}

export function removeConversation(index: ConversationIndex, id: string): ConversationIndex {
  return { version: 1, conversations: index.conversations.filter((conversation) => conversation.id !== id) }
}

export function findConversation(index: ConversationIndex, id: string): Undef<ConversationSummary> {
  return index.conversations.find((conversation) => conversation.id === id)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
