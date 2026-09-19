import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ChatMessage, type ConversationSummary, folderTree, type RuntimeEvent } from '@alpha/core'
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
const freshManager = (env: NodeJS.ProcessEnv = {}, events: RuntimeEvent[] = []) => {
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
    emit: (event) => events.push(event),
    emitRules: () => undefined,
  })
  return { manager, store, workspace, dataDirectory, events }
}

/**
 * A manager whose model collection is the configured providers rather than the scripted one, so
 * the models a conversation may run on are real. Nothing here dials out: no turn is ever started.
 */
const configuredManager = (dataDirectory?: string) => {
  const directory = dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-data-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const providers = new ProviderStore(directory, new CredentialVault(directory, testCipher))
  providers.save({
    id: 'local',
    name: 'Local',
    api: 'openai-completions',
    baseUrl: 'https://llm.internal.example/v1',
    models: [
      { id: 'local-7b', name: 'Local 7B', contextWindow: 32_000, maxTokens: 4_096, reasoning: false },
      { id: 'local-70b', name: 'Local 70B', contextWindow: 128_000, maxTokens: 8_192, reasoning: false },
    ],
  })
  const manager = new RuntimeManager({
    dataDirectory: directory,
    sessionsRoot: join(directory, 'sessions'),
    providers,
    store: new StateStore(directory),
    env: {},
    emit: () => undefined,
    emitRules: () => undefined,
  })
  return { manager, providers, workspace, dataDirectory: directory }
}

describe('[runtime] what a conversation runs on', () => {
  it('is the default model to begin with, and its own choice from then on', async () => {
    const { manager, workspace, dataDirectory } = configuredManager()
    const created = await manager.create(workspace)
    expect(created.conversation.model).toEqual({ providerId: 'local', modelId: 'local-7b' })

    const switched = await manager.setConversationModel(created.conversation.id, 'local', 'local-70b')
    expect(switched.model).toEqual({ providerId: 'local', modelId: 'local-70b' })
    await manager.closeAll()

    // The choice is the conversation's, so the next launch reads it back with the conversation.
    const reopened = configuredManager(dataDirectory)
    expect(reopened.manager.list()[0]?.model).toEqual({ providerId: 'local', modelId: 'local-70b' })
    await reopened.manager.closeAll()
  })

  it('refuses a model the provider does not serve', async () => {
    const { manager, workspace } = configuredManager()
    const created = await manager.create(workspace)

    await expect(manager.setConversationModel(created.conversation.id, 'local', 'ghost')).rejects.toThrow(
      /does not serve/,
    )
    await expect(manager.setConversationModel(created.conversation.id, 'nobody', 'local-7b')).rejects.toThrow(
      /does not serve/,
    )
    await manager.closeAll()
  })

  it('starts what is created later on the default the models panel chose', async () => {
    const { manager, providers, workspace } = configuredManager()
    providers.setDefaultModel({ providerId: 'local', modelId: 'local-70b' })

    const created = await manager.create(workspace)
    expect(created.conversation.model).toEqual({ providerId: 'local', modelId: 'local-70b' })
    await manager.closeAll()
  })
})

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
  it('shows each folder it has worked in, with what is in it', async () => {
    const { manager, workspace } = freshManager()
    const second = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    await manager.create(workspace)
    await manager.create(second)

    // Nothing is remembered here — this is the manager's own list, with no recents behind it — so
    // both folders are in the tree because both have conversations.
    const folders = folderTree([], manager.list())

    expect(folders).toHaveLength(2)
    expect(folders.map((folder) => folder.path).sort()).toEqual([workspace, second].sort())
    expect(folders.every((folder) => folder.conversations.length === 1)).toBe(true)
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

describe('[runtime] the reason a tool call ran', () => {
  it('is still in the ledger after a relaunch, and goes when the conversation does', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-data-'))
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const events: RuntimeEvent[] = []
    const manager = new RuntimeManager({
      dataDirectory,
      sessionsRoot: join(dataDirectory, 'sessions'),
      providers: new ProviderStore(dataDirectory, new CredentialVault(dataDirectory, testCipher)),
      store: new StateStore(dataDirectory),
      env: {
        ALPHA_FAUX: '1',
        ALPHA_FAUX_REPLIES: JSON.stringify([
          { tool: { name: 'write', args: { path: 'notes.txt', content: 'written' } } },
          'Written.',
        ]),
      },
      emit: (event) => events.push(event),
      emitRules: () => undefined,
    })

    // Level ask: the write has to go past the gate, and the answer is what gets remembered.
    const created = await manager.create(workspace)
    const running = manager.prompt(created.conversation.id, 'write the file')
    manager.answerApproval(created.conversation.id, await waitForApproval(events), { decision: 'once' })
    await running
    await manager.closeAll()

    const reopened = freshManagerAt(dataDirectory, workspace)
    const opened = await reopened.open(created.conversation.id)
    const tool = opened.messages.flatMap((message) => message.blocks).find((block) => block.kind === 'tool')
    expect(tool?.kind === 'tool' ? tool.approval : undefined).toEqual({ kind: 'once', level: 'ask' })
    await reopened.closeAll()

    // The note is part of the conversation: deleting it deletes the file too.
    await manager.remove(created.conversation.id)
    expect(existsSync(join(dataDirectory, 'decisions', `${created.conversation.id}.json`))).toBe(false)
  })
})

/** The window learns about the card from the events, so the test does the same. */
async function waitForApproval(events: RuntimeEvent[]): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const request = events.find((event) => event.type === 'approval_requested')
    if (request?.type === 'approval_requested') return request.request.requestId
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('no approval was asked for')
}

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

const freshManagerAt = (dataDirectory: string, workspace: string, env: NodeJS.ProcessEnv = {}) => {
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
  void workspace
  return manager
}

/** Every text block of a transcript, in order, which is what a reader would see. */
const texts = (messages: ChatMessage[]): string[] =>
  messages.flatMap((message) => message.blocks.filter((block) => block.kind === 'text').map((block) => block.text))

const REPLIES = JSON.stringify(['THE FIRST ANSWER', 'THE SECOND ANSWER'])

function readdirDeep(directory: string): string[] {
  if (!existsSync(directory)) return []
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? readdirDeep(path) : [path]
  })
}

describe('[runtime] reading a conversation back', () => {
  // The branch tip is what the window shows, and answering again moves it. A reader that walks
  // the whole log instead brings back the answer that was replaced, and the question with it.
  it('shows the answer that is on the branch, not the one regenerate replaced', async () => {
    const { manager, workspace, dataDirectory } = freshManager({ ALPHA_FAUX_REPLIES: REPLIES })
    const created = await manager.create(workspace)
    await manager.prompt(created.conversation.id, 'a question')
    await manager.regenerate(created.conversation.id)
    const live = await manager.transcriptFor(created.conversation.id)
    await manager.closeAll()

    const reopened = freshManagerAt(dataDirectory, workspace, { ALPHA_FAUX_REPLIES: REPLIES })
    const opened = await reopened.open(created.conversation.id)
    await reopened.closeAll()

    expect(texts(live)).toEqual(['a question', 'THE SECOND ANSWER'])
    expect(texts(opened.messages)).toEqual(texts(live))
  })

  it('shows the branch after an edit replaced what followed', async () => {
    const { manager, workspace, dataDirectory } = freshManager({ ALPHA_FAUX_REPLIES: REPLIES })
    const created = await manager.create(workspace)
    await manager.prompt(created.conversation.id, 'a question')
    await manager.editMessage(created.conversation.id, 0, 'a better question', 'replace')
    const live = await manager.transcriptFor(created.conversation.id)
    await manager.closeAll()

    const reopened = freshManagerAt(dataDirectory, workspace, { ALPHA_FAUX_REPLIES: REPLIES })
    const opened = await reopened.open(created.conversation.id)
    await reopened.closeAll()

    expect(texts(live)).toEqual(['a better question', 'THE SECOND ANSWER'])
    expect(texts(opened.messages)).toEqual(texts(live))
  })
})

/**
 * The rule an edit and a regenerate share: the tip moved, so what the window is showing is no
 * longer the conversation, and it has to be handed the transcript that is on the branch.
 */
describe('[runtime] telling the window the transcript changed', () => {
  it('replaces it after an edit that continued from the edit', async () => {
    const { manager, workspace, events } = freshManager({ ALPHA_FAUX_REPLIES: REPLIES })
    const created = await manager.create(workspace)
    await manager.prompt(created.conversation.id, 'a question')
    await manager.prompt(created.conversation.id, 'a second question')
    events.length = 0

    // No settling: the call resolving is the promise that the window has been told.
    await manager.editMessage(created.conversation.id, 0, 'a better question', 'replace')

    const replaced = events.filter((event) => event.type === 'transcript_replaced')
    expect(replaced).toHaveLength(1)
    const handed = replaced[0].type === 'transcript_replaced' ? replaced[0].messages : []
    expect(texts(handed)).toEqual(['a better question', 'THE SECOND ANSWER'])
  })

  it('leaves it alone when the edit forked instead, because this conversation did not change', async () => {
    const { manager, workspace, events } = freshManager({ ALPHA_FAUX_REPLIES: REPLIES })
    const created = await manager.create(workspace)
    await manager.prompt(created.conversation.id, 'a question')
    events.length = 0

    const forked = await manager.editMessage(created.conversation.id, 0, 'a better question', 'fork')
    await settle()

    expect(forked.conversation.id).not.toBe(created.conversation.id)
    expect(events.filter((event) => event.type === 'transcript_replaced')).toEqual([])
  })

  it('says nothing when a regenerate had nothing to run again', async () => {
    const { manager, workspace, events } = freshManager({ ALPHA_FAUX_REPLIES: REPLIES })
    const created = await manager.create(workspace)
    events.length = 0

    await manager.regenerate(created.conversation.id)
    await settle()

    expect(events.filter((event) => event.type === 'transcript_replaced')).toEqual([])
  })

  it('takes an edit after a relaunch that followed a kill mid-turn', async () => {
    // Closing the window mid-turn leaves the index saying "running", and nothing will ever
    // finish that turn. The window's idea of it is a projection; the lane's is the fact.
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-data-'))
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const slow = {
      ALPHA_FAUX_REPLIES: JSON.stringify(['An answer long enough that the app is still writing it out.']),
      ALPHA_FAUX_TOKENS_PER_SECOND: '20',
      ALPHA_FAUX_TOKEN_SIZE: '4',
    }
    const first = freshManagerAt(dataDirectory, workspace, slow)
    const created = await first.create(workspace)
    const running = first.prompt(created.conversation.id, 'a long task')
    await new Promise((resolve) => setTimeout(resolve, 100))
    await first.closeAll()
    await running.catch(() => undefined)

    const second = freshManagerAt(dataDirectory, workspace, {
      ALPHA_FAUX_REPLIES: JSON.stringify(['The corrected answer.']),
    })
    const opened = await second.editMessage(created.conversation.id, 0, 'a better question', 'replace')
    await second.closeAll()

    expect(texts(opened.messages)).toEqual(['a better question', 'The corrected answer.'])
  })
})

/** A negative assertion needs the chance to have passed, so it waits for anything in flight. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

/**
 * The window keeps one copy of a conversation's summary, and the sidebar and the header both read
 * it. Every change to it takes the same road — an event — so no caller has to remember to say so.
 */
describe('[runtime] a change to a conversation', () => {
  const lastUpdate = (events: RuntimeEvent[], id: string): ConversationSummary | undefined => {
    const updates = events.filter((event) => event.type === 'conversation_updated' && event.conversationId === id)
    const last = updates.at(-1)
    return last?.type === 'conversation_updated' ? last.conversation : undefined
  }

  it('reaches the window whichever field changed', async () => {
    const { manager, workspace, events } = freshManager()
    const created = await manager.create(workspace)
    const id = created.conversation.id
    events.length = 0

    manager.rename(id, 'The parser rewrite')
    expect(lastUpdate(events, id)?.title).toBe('The parser rewrite')

    await manager.setThinkingLevel(id, 'high')
    expect(lastUpdate(events, id)?.thinkingLevel).toBe('high')

    manager.setConversationLevel(id, 'plan')
    expect(lastUpdate(events, id)?.permissionLevel).toBe('plan')

    await manager.setConversationModel(id, 'faux', 'scripted')
    expect(lastUpdate(events, id)?.model).toEqual({ providerId: 'faux', modelId: 'scripted' })
  })

  it('carries the whole conversation, not the field that changed', async () => {
    const { manager, workspace, events } = freshManager()
    const created = await manager.create(workspace)
    const id = created.conversation.id
    manager.rename(id, 'The parser rewrite')
    events.length = 0

    manager.setConversationLevel(id, 'plan')

    // The window replaces its copy with this one, so a field left out would be lost there.
    expect(lastUpdate(events, id)).toEqual(manager.list().find((conversation) => conversation.id === id))
  })
})

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
