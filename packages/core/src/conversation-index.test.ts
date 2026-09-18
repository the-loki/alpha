import { describe, expect, it } from 'vitest'
import {
  emptyConversationIndex,
  findConversation,
  listForWorkspace,
  parseConversationIndex,
  removeConversation,
  upsertConversation,
} from './conversation-index.ts'
import type { ConversationSummary } from './runtime-events.ts'

const conversation = (id: string, workspacePath: string, updatedAt: number): ConversationSummary => ({
  id,
  workspacePath,
  title: `Conversation ${id}`,
  createdAt: updatedAt - 10,
  updatedAt,
  status: 'idle',
})

const index = {
  version: 1 as const,
  conversations: [conversation('a', '/dev/alpha', 10), conversation('b', '/dev/beta', 30)],
}

describe('parseConversationIndex', () => {
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

describe('listForWorkspace', () => {
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

describe('upsertConversation', () => {
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

describe('removeConversation', () => {
  it('drops the conversation', () => {
    expect(removeConversation(index, 'a').conversations.map((entry) => entry.id)).toEqual(['b'])
  })

  it('is silent about an id that is not there', () => {
    expect(removeConversation(index, 'zzz').conversations).toHaveLength(2)
  })
})

describe('findConversation', () => {
  it('finds by id', () => {
    expect(findConversation(index, 'b')?.workspacePath).toBe('/dev/beta')
  })

  it('reports nothing for an unknown id', () => {
    expect(findConversation(index, 'zzz')).toBeUndefined()
  })
})
