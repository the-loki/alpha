import { describe, expect, it } from 'vitest'
import {
  archiveConversation,
  archivedConversations,
  emptyConversationIndex,
  findConversation,
  folderTree,
  listForWorkspace,
  parseConversationIndex,
  removeConversation,
  unarchiveConversation,
  upsertConversation,
} from './conversation-index.ts'
import type { ConversationSummary } from './runtime-events.ts'
import type { WorkspaceRef } from './workspace.ts'

const conversation = (id: string, workspacePath: string, updatedAt: number): ConversationSummary => ({
  id,
  workspacePath,
  title: `Conversation ${id}`,
  createdAt: updatedAt - 10,
  updatedAt,
  status: 'idle',
  permissionLevel: 'ask',
  model: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
  thinkingLevel: 'medium',
  sessionId: '',
})

const folder = (path: string, lastOpenedAt: number, name = path.slice(path.lastIndexOf('/') + 1)): WorkspaceRef => ({
  path,
  name,
  lastOpenedAt,
})

const index = {
  version: 1 as const,
  conversations: [conversation('a', '/dev/alpha', 10), conversation('b', '/dev/beta', 30)],
}

describe('[core] parseConversationIndex', () => {
  it('round-trips an index', () => {
    expect(parseConversationIndex(JSON.parse(JSON.stringify(index)))).toEqual(index)
  })

  it('treats garbage as an empty index', () => {
    expect(parseConversationIndex('{not json')).toEqual(emptyConversationIndex())
    expect(parseConversationIndex(null)).toEqual(emptyConversationIndex())
    expect(parseConversationIndex({ version: 2, conversations: [] })).toEqual(emptyConversationIndex())
  })

  it('treats a conversation with a bad status as an empty index', () => {
    const broken = { version: 1, conversations: [{ ...conversation('a', '/dev/alpha', 1), status: 'running-away' }] }
    expect(parseConversationIndex(broken)).toEqual(emptyConversationIndex())
  })
})

describe('[core] listForWorkspace', () => {
  it('returns only that workspace, most recently used first', () => {
    const withMore = {
      version: 1 as const,
      conversations: [
        conversation('old', '/dev/alpha', 1),
        conversation('new', '/dev/alpha', 9),
        conversation('other', '/dev/beta', 20),
      ],
    }
    expect(listForWorkspace(withMore, '/dev/alpha').map((entry) => entry.id)).toEqual(['new', 'old'])
  })

  it('returns nothing for a workspace with no conversations', () => {
    expect(listForWorkspace(index, '/dev/gamma')).toEqual([])
  })
})

describe('[core] upsertConversation', () => {
  it('adds a conversation to the front', () => {
    const updated = upsertConversation(emptyConversationIndex(), conversation('a', '/dev/alpha', 1))
    expect(updated.conversations.map((entry) => entry.id)).toEqual(['a'])
  })

  it('replaces an existing conversation rather than duplicating it', () => {
    const updated = upsertConversation(index, { ...conversation('a', '/dev/alpha', 99), title: 'Renamed' })
    expect(updated.conversations).toHaveLength(2)
    expect(findConversation(updated, 'a')?.title).toBe('Renamed')
  })
})

describe('[core] removeConversation', () => {
  it('drops the conversation', () => {
    expect(removeConversation(index, 'a').conversations.map((entry) => entry.id)).toEqual(['b'])
  })

  it('is silent about an id that is not there', () => {
    expect(removeConversation(index, 'zzz').conversations).toHaveLength(2)
  })
})

describe('[core] findConversation', () => {
  it('finds by id', () => {
    expect(findConversation(index, 'b')?.workspacePath).toBe('/dev/beta')
  })

  it('reports nothing for an unknown id', () => {
    expect(findConversation(index, 'zzz')).toBeUndefined()
  })
})

describe('[core] folderTree', () => {
  it('keeps a remembered folder that has no conversations yet', () => {
    const tree = folderTree([folder('/dev/alpha', 10)], [])
    expect(tree.map((node) => node.path)).toEqual(['/dev/alpha'])
    expect(tree[0].conversations).toEqual([])
  })

  it('adds a folder that has conversations but is not remembered, named from its path', () => {
    const tree = folderTree([], [conversation('a', '/dev/beta', 10)])
    expect(tree.map((node) => node.name)).toEqual(['beta'])
    expect(tree[0].conversations.map((entry) => entry.id)).toEqual(['a'])
  })

  it('lists a folder once, with the name the workbench remembers', () => {
    const tree = folderTree([folder('/dev/beta', 1, 'Beta (work)')], [conversation('a', '/dev/beta', 10)])
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('Beta (work)')
    expect(tree[0].conversations.map((entry) => entry.id)).toEqual(['a'])
  })

  it('orders folders by the most recent thing that happened in them', () => {
    const tree = folderTree([folder('/dev/alpha', 50), folder('/dev/beta', 20)], [conversation('a', '/dev/beta', 90)])
    expect(tree.map((node) => node.path)).toEqual(['/dev/beta', '/dev/alpha'])
  })

  it('orders the conversations inside a folder newest first', () => {
    const tree = folderTree([], [conversation('old', '/dev/alpha', 1), conversation('new', '/dev/alpha', 90)])
    expect(tree[0].conversations.map((entry) => entry.id)).toEqual(['new', 'old'])
  })

  it('has nothing to show when there are no folders and no conversations', () => {
    expect(folderTree([], [])).toEqual([])
  })
})

describe('[core] archiving', () => {
  it('sets a timestamp and takes it away again, leaving the rest alone', () => {
    const archived = archiveConversation(index, 'a', 1234)
    expect(findConversation(archived, 'a')?.archivedAt).toBe(1234)
    expect(findConversation(archived, 'b')).toEqual(findConversation(index, 'b'))

    const back = unarchiveConversation(archived, 'a')
    expect(findConversation(back, 'a')?.archivedAt).toBeUndefined()
    expect(back.conversations).toHaveLength(2)
  })

  it('does nothing to a conversation that is not there', () => {
    expect(archiveConversation(index, 'nope', 1).conversations).toEqual(index.conversations)
    expect(unarchiveConversation(index, 'nope').conversations).toEqual(index.conversations)
  })

  it('reads an index written before archiving existed', () => {
    const before = { version: 1, conversations: [{ ...conversation('a', '/dev/alpha', 10) }] }
    expect(parseConversationIndex(before).conversations).toHaveLength(1)
  })

  it('keeps an archived conversation out of the tree, and out of what made the folder recent', () => {
    const archived = archiveConversation(index, 'b', 99)
    const tree = folderTree([folder('/dev/alpha', 1)], archived.conversations)
    expect(tree.map((node) => node.path)).toEqual(['/dev/alpha'])
    expect(tree[0].conversations.map((entry) => entry.id)).toEqual(['a'])
    expect(tree[0].lastActiveAt).toBe(10)
  })

  it('answers with the archived ones, newest first', () => {
    const both = archiveConversation(archiveConversation(index, 'a', 5), 'b', 9)
    expect(archivedConversations(both.conversations).map((entry) => entry.id)).toEqual(['b', 'a'])
    expect(archivedConversations(index.conversations)).toEqual([])
  })
})
