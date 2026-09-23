import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConversationSummary } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
import { ConversationBookkeeper, newConversation } from './bookkeeping.ts'
import { ConversationIndexStore } from './index-store.ts'

/** A conversation the last process left behind: written to the index, and nobody driving it. */
const leftBehind = (dataDirectory: string, status: ConversationSummary['status']): ConversationSummary => {
  const store = new ConversationIndexStore(dataDirectory)
  return store.upsert({
    ...newConversation({ id: 'c1', workspacePath: '/tmp/alpha-workspace', now: 1, permissionLevel: 'ask' }),
    status,
  })
}

const fileOn = (dataDirectory: string): { conversations: ConversationSummary[] } =>
  JSON.parse(readFileSync(join(dataDirectory, 'conversations.json'), 'utf-8'))

const started = (dataDirectory: string): ConversationBookkeeper =>
  new ConversationBookkeeper({ dataDirectory, emit: () => {} })

describe('[conversations] the status a workbench starts on', () => {
  it('ends a run nobody is driving as it reads the index (ADR-0008)', () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-books-'))
    leftBehind(dataDirectory, 'running')

    const books = started(dataDirectory)

    // The window draws a working mark from this field, and `canArchive` refuses a conversation that
    // is working — both of them for good, if the status of a dead process is what is left in it.
    expect(books.find('c1')?.status).toBe('idle')
    expect(fileOn(dataDirectory).conversations[0]?.status).toBe('idle')
  })

  it('does the same for one that was waiting on an approval', () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-books-'))
    leftBehind(dataDirectory, 'waiting')

    expect(started(dataDirectory).find('c1')?.status).toBe('idle')
  })

  it('leaves a conversation that was idle alone', () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-books-'))
    const idle = leftBehind(dataDirectory, 'idle')

    const books = started(dataDirectory)

    expect(books.find('c1')).toEqual(idle)
  })
})
