import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { groupByWorkspace } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { CredentialVault, type SecretCipher } from '../providers/credential-vault.ts'
import { ProviderStore } from '../providers/store.ts'
import { StateStore } from '../state-store.ts'
import { RuntimeManager } from './manager.ts'

/** A cipher that does nothing, so the vault is real but the test never touches a keychain. */
const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

/**
 * Conversation management, through the real manager and the real session store: renaming,
 * grouping, deleting a transcript from disk, and reading a conversation back after the runtime
 * compacted it.
 */
const freshManager = (env: NodeJS.ProcessEnv = {}) => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-data-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const store = new StateStore(dataDirectory)
  const vault = new CredentialVault(dataDirectory, testCipher)
  const manager = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers: new ProviderStore(dataDirectory, vault),
    store,
    env: { ALPHA_FAUX: '1', ALPHA_FAUX_REPLIES: JSON.stringify(['Noted.']), ...env },
    emit: () => undefined,
    emitRules: () => undefined,
  })
  return { manager, store, workspace, dataDirectory }
}

describe('[runtime] naming a conversation', () => {
  it('renames it, and the new name survives a restart', async () => {
    const { manager, workspace, dataDirectory } = freshManager()
    const created = await manager.create(workspace)

    const renamed = manager.rename(created.conversation.id, 'The parser rewrite')
    expect(renamed.title).toBe('The parser rewrite')
    await manager.closeAll()

    const reopened = freshManagerAt(dataDirectory, workspace)
    expect(reopened.list().map((conversation) => conversation.title)).toEqual(['The parser rewrite'])
  })

  it('refuses to rename a conversation that is not there', async () => {
    const { manager } = freshManager()
    expect(() => manager.rename('nobody', 'New name')).toThrow()
  })
})

describe('[runtime] the conversation list', () => {
  it('groups by workspace, most recently used first', async () => {
    const { manager, workspace } = freshManager()
    const second = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    await manager.create(workspace)
    await manager.create(second)

    const groups = groupByWorkspace(manager.list())

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.path).sort()).toEqual([workspace, second].sort())
    expect(groups.every((group) => group.count === 1)).toBe(true)
  })

  it('marks a conversation as running while a turn is in flight, and idle after it', async () => {
    const { manager, workspace } = freshManager()
    const created = await manager.create(workspace)

    await manager.prompt(created.conversation.id, 'hello')
    await manager.closeAll()

    expect(manager.list()[0]?.status).toBe('idle')
  })
})

describe('[runtime] deleting a conversation', () => {
  it('takes the transcript off the disk, not just off the list', async () => {
    const { manager, workspace, dataDirectory } = freshManager()
    const created = await manager.create(workspace)
    await manager.prompt(created.conversation.id, 'remember this')
    const sessionsRoot = join(dataDirectory, 'sessions')
    expect(existsSync(sessionsRoot)).toBe(true)

    const remaining = await manager.remove(created.conversation.id)

    expect(remaining).toEqual([])
    expect(() => manager.rename(created.conversation.id, 'still here')).toThrow()
    // Nothing is left on disk: no session directory with entries in it.
    const leftovers = readdirDeep(sessionsRoot)
    expect(leftovers.some((path) => path.endsWith('.jsonl'))).toBe(false)
  })

  it('can be asked for a transcript that no longer exists without inventing one', async () => {
    const { manager, workspace } = freshManager()
    const created = await manager.create(workspace)
    await manager.remove(created.conversation.id)
    expect(manager.list()).toEqual([])
    await expect(manager.transcriptFor(created.conversation.id)).rejects.toThrow('No conversation')
  })
})

describe('[runtime] the conversation that was open', () => {
  it('is remembered when it opens, and forgotten when it is deleted', async () => {
    const { manager, store, workspace } = freshManager()
    const first = await manager.create(workspace)
    expect(store.read().lastConversationId).toBe(first.conversation.id)

    const second = await manager.create(workspace)
    await manager.open(first.conversation.id)
    expect(store.read().lastConversationId).toBe(first.conversation.id)

    // Deleting a conversation that was not the remembered one leaves the memory alone.
    await manager.remove(second.conversation.id)
    expect(store.read().lastConversationId).toBe(first.conversation.id)

    await manager.remove(first.conversation.id)
    expect(store.read().lastConversationId).toBe('')
    await manager.closeAll()
  })

  it('survives a restart, because the next launch reads it off disk', async () => {
    const { manager, workspace, dataDirectory } = freshManager()
    const created = await manager.create(workspace)
    await manager.closeAll()

    // A second StateStore over the same directory is what the next launch reads.
    expect(new StateStore(dataDirectory).read().lastConversationId).toBe(created.conversation.id)
  })
})

describe('[runtime] exporting a conversation', () => {
  it('writes the markdown beside the workspace and reports where it went', async () => {
    const { manager, workspace } = freshManager({ ALPHA_FAUX_REPLIES: JSON.stringify(['The answer is 42.']) })
    const created = await manager.create(workspace)
    await manager.prompt(created.conversation.id, 'what is the answer')
    manager.rename(created.conversation.id, 'The answer')

    const { path } = await manager.exportMarkdown(created.conversation.id)

    expect(path).toBe(join(workspace, 'the-answer.md'))
    const markdown = readFileSync(path, 'utf8')
    expect(markdown).toContain('# The answer')
    expect(markdown).toContain('what is the answer')
    expect(markdown).toContain('The answer is 42.')
  })
})

const freshManagerAt = (dataDirectory: string, workspace: string) => {
  const store = new StateStore(dataDirectory)
  const vault = new CredentialVault(dataDirectory, testCipher)
  const manager = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers: new ProviderStore(dataDirectory, vault),
    store,
    env: { ALPHA_FAUX: '1', ALPHA_FAUX_REPLIES: JSON.stringify(['Noted.']) },
    emit: () => undefined,
    emitRules: () => undefined,
  })
  void workspace
  return manager
}

function readdirDeep(directory: string): string[] {
  if (!existsSync(directory)) return []
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? readdirDeep(path) : [path]
  })
}

describe('[runtime] compaction', () => {
  it('marks where the history was summarised and keeps the summary readable', async () => {
    const { manager, workspace } = freshManager({
      ALPHA_FAUX_REPLIES: JSON.stringify(['The first answer.', 'Earlier turns were about naming things.']),
    })
    const created = await manager.create(workspace)
    await manager.prompt(created.conversation.id, 'which name is better')

    const compacted = await manager.compactConversation(created.conversation.id)
    expect(compacted).toBe(true)
    const messages = await manager.transcriptFor(created.conversation.id)

    const marker = messages.flatMap((message) => message.blocks).find((block) => block.kind === 'compaction')
    expect(marker).toMatchObject({ kind: 'compaction', summary: 'Earlier turns were about naming things.' })
    await manager.closeAll()
  })

  it('takes a new prompt afterwards, and the turn after it renders', async () => {
    const { manager, workspace } = freshManager({
      ALPHA_FAUX_REPLIES: JSON.stringify([
        'The first answer.',
        'Earlier turns were about naming things.',
        'The answer after the summary.',
      ]),
    })
    const created = await manager.create(workspace)
    await manager.prompt(created.conversation.id, 'first question')
    await manager.compactConversation(created.conversation.id)

    await manager.prompt(created.conversation.id, 'second question')
    const messages = await manager.transcriptFor(created.conversation.id)
    await manager.closeAll()

    const kinds = messages.flatMap((message) => message.blocks.map((block) => block.kind))
    expect(kinds).toContain('compaction')
    expect(kinds.indexOf('compaction')).toBeLessThan(kinds.length - 1)
    const texts = messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.blocks.filter((block) => block.kind === 'text').map((block) => block.text))
    expect(texts).toContain('The answer after the summary.')
  })
})
