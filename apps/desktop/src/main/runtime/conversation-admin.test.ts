import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aModel, scriptedModels, textStream, toolUseStream } from '@alpha/agent/testing'
import { type ChatMessage, type ConversationSummary, folderTree, type RuntimeEvent } from '@alpha/domain'
import { CredentialVault, ProviderStore, type SecretCipher } from '@alpha/providers'
import { StateStore } from '@alpha/state'
import type { AssistantMessage, Model } from '@earendil-works/pi-ai'
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import { describe, expect, it } from 'vitest'
import { RuntimeManager } from './manager.ts'

/** A cipher that does nothing, so the vault is real but the test never touches a keychain. */
const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

/** What the fixture saves about its one provider, whose models the scripted runtime serves. */
const providerDefinition = (images: boolean) => ({
  id: 'p',
  name: 'Scripted',
  api: 'openai-completions' as const,
  baseUrl: 'https://llm.internal.example/v1',
  models: [{ id: 'm', name: 'M', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images }],
})

/**
 * The manager over the embedded agent (ADR-0025): a real conversation runtime whose provider
 * streams from a script, a real session store on disk, and a real index. Nothing spawns.
 */
interface FixtureOptions {
  replies?: string[]
  /** The sentence agent.credential answers with, for the missing-key refusal (#114). */
  keyProblem?: string
  /** No provider is configured at all, which is the no-model refusal. */
  noProviders?: boolean
  /** The one model takes pictures. It does not by default (ADR-0018). */
  images?: boolean
  /** A reply that stays in flight for a while, as the turn a window closes in the middle of. */
  slowReply?: { text: string; afterMs: number }
  /** The call the first scripted turn asks for, which puts the gate on the path. */
  toolCall?: { name: string; args: Record<string, string> }
  /** The compaction thresholds the assembled policy runs with, shrunk for the test. */
  compactionSettings?: { reserveTokens: number; keepRecentTokens: number }
}

/** Waits until one event of `kind` has been seen, which is what a mid-run act needs. */
const waitedFor = async (events: RuntimeEvent[], kind: string): Promise<void> => {
  for (let attempt = 0; attempt < 500 && !events.some((event) => event.type === kind); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const freshManager = (options: FixtureOptions = {}) => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-data-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const store = new StateStore(dataDirectory)
  const vault = new CredentialVault(dataDirectory, testCipher)
  const providers = new ProviderStore(dataDirectory, vault)
  if (options.noProviders !== true) providers.save(providerDefinition(options.images === true))
  const events: RuntimeEvent[] = []
  const manager = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers,
    store,
    // The slim ports: the sessions are Alpha's, and only the key problem is asked before a run.
    agent: {
      sessionsRoot: join(dataDirectory, 'sessions'),
      keyProblem: () => options.keyProblem,
    },
    models: () => scriptedModels(scriptOf(options)),
    compactionSettings:
      options.compactionSettings === undefined ? undefined : { enabled: true, ...options.compactionSettings },
    emit: (event) => events.push(event),
    emitRules: () => undefined,
  })
  return { manager, providers, store, workspace, dataDirectory, events }
}

/** One script per open: the n-th turn hears the n-th reply, and one past the end hears the last again. */
function scriptOf(options: FixtureOptions): Array<() => AssistantMessageEventStream> {
  const replies = options.replies ?? ['Noted.']
  const last = replies.at(-1) ?? 'Noted.'
  const drives = [...replies, ...Array(4).fill(last)].map(
    (reply) => (): AssistantMessageEventStream => textStream(reply),
  )
  if (options.toolCall !== undefined) {
    const { name, args } = options.toolCall
    drives.unshift(() => toolUseStream(name, args))
  }
  if (options.slowReply !== undefined) {
    const { text, afterMs } = options.slowReply
    drives[0] = () => {
      const stream = new AssistantMessageEventStream()
      stream.push({
        type: 'start',
        partial: partialAssistant(''),
      })
      setTimeout(() => stream.push({ type: 'done', reason: 'stop', message: partialAssistant(text) }), afterMs)
      return stream
    }
  }
  return drives
}

const partialAssistant = (text: string): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
  api: 'openai-completions',
  provider: 'p',
  model: 'm',
  usage: {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason: 'stop',
  timestamp: Date.now(),
})

/** A manager whose model collection serves two models under one provider, as the panel would. */
const localModel = (id: string): Model<'openai-completions'> => ({ ...aModel(), id, provider: 'local' })

const configuredManager = (dataDirectory?: string, seed = true, events: RuntimeEvent[] = []) => {
  const directory = dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-data-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const providers = new ProviderStore(directory, new CredentialVault(directory, testCipher))
  // A manager over an existing directory reads what is there rather than writing the fixture over
  // it, which is what a relaunch does.
  if (seed) {
    providers.save({
      id: 'local',
      name: 'Local',
      api: 'openai-completions',
      baseUrl: 'https://llm.internal.example/v1',
      models: [
        { id: 'local-7b', name: 'Local 7B', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images: false },
        {
          id: 'local-70b',
          name: 'Local 70B',
          contextWindow: 128_000,
          maxTokens: 8_192,
          reasoning: false,
          images: false,
        },
      ],
    })
  }
  const manager = new RuntimeManager({
    dataDirectory: directory,
    sessionsRoot: join(directory, 'sessions'),
    providers,
    store: new StateStore(directory),
    agent: {
      sessionsRoot: join(directory, 'sessions'),
      keyProblem: () => undefined,
    },
    models: () => scriptedModels([() => textStream('Noted.')], [localModel('local-7b'), localModel('local-70b')]),
    emit: (event) => events.push(event),
    emitRules: () => undefined,
  })
  return { manager, providers, workspace, dataDirectory: directory, events }
}

/** Sends a message and waits for the turn it started, which is what a reading test needs. */
const tell = async (manager: RuntimeManager, events: RuntimeEvent[], id: string, text: string): Promise<void> => {
  const ended = (): number =>
    events.filter((event) => event.type === 'turn_finished' || event.type === 'run_failed').length
  const before = ended()
  await manager.prompt(id, text)
  for (let attempt = 0; attempt < 500 && ended() === before; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** Every text block of a transcript, in order, which is what a reader would see. */
const texts = (messages: ChatMessage[]): string[] =>
  messages.flatMap((message) => message.blocks.filter((block) => block.kind === 'text').map((block) => block.text))

const REPLIES = ['THE FIRST ANSWER', 'THE SECOND ANSWER']

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

  it('refuses a picture for a model that does not take one, before the turn starts', async () => {
    const { manager, providers, workspace, dataDirectory, events } = freshManager()
    const created = await manager.create(workspace)
    const picture = { mimeType: 'image/png', data: 'AAAA' }

    await expect(manager.prompt(created.conversation.id, 'look at this', [picture])).rejects.toThrow(
      /does not take pictures/,
    )
    // The same message without the picture is not the boundary's business: it goes through.
    await tell(manager, events, created.conversation.id, 'look at this')
    await manager.closeAll()

    // And turning the setting on is what lets it through the gate.
    providers.saveModels('p', [
      { id: 'm', name: 'M', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images: true },
    ])
    // The same directory, so the saved settings are the ones the new manager reads.
    const after = freshManagerAt(dataDirectory)
    const second = await after.manager.create(workspace)
    await expect(after.manager.prompt(second.conversation.id, 'look at this', [picture])).resolves.toBeUndefined()
    await after.manager.closeAll()
  })

  it('refuses a turn when no model is configured at all', async () => {
    const { manager, workspace, events } = freshManager({ noProviders: true })
    const created = await manager.create(workspace)

    await expect(manager.prompt(created.conversation.id, 'hello')).rejects.toThrow(/No model/)
    expect(events.filter((event) => event.type === 'turn_started')).toEqual([])
    await manager.closeAll()
  })

  it('refuses a turn before it runs when the key cannot be read (#114)', async () => {
    const { manager, workspace, events } = freshManager({
      keyProblem: 'Alpha has no key for p. Add one under Settings, Providers.',
    })
    const created = await manager.create(workspace)

    await expect(manager.prompt(created.conversation.id, 'hello')).rejects.toThrow(/no key for p/)
    expect(events.filter((event) => event.type === 'turn_started')).toEqual([])
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

describe('[runtime] open, prompt, and the events between', () => {
  it('runs a turn end to end, and the window hears the whole of it', async () => {
    const { manager, workspace, events } = freshManager({ replies: ['Noted.'] })
    const created = await manager.create(workspace)

    await tell(manager, events, created.conversation.id, 'hello')
    await manager.closeAll()

    expect(events.filter((event) => event.type === 'user_message')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'turn_started')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'assistant_message_finished')).toHaveLength(1)
    expect(events.filter((event) => event.type === 'turn_finished')).toHaveLength(1)
  })

  it('answers a conversation reopened after a relaunch with the same transcript', async () => {
    const { manager, workspace, dataDirectory, events } = freshManager({ replies: ['Noted.'] })
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'remember this')
    const live = await manager.transcriptFor(created.conversation.id)
    await manager.closeAll()

    const reopened = freshManagerAt(dataDirectory)
    const opened = await reopened.manager.open(created.conversation.id)
    expect(opened.messages).toEqual(live)
    expect(opened.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    await reopened.manager.closeAll()
  })

  it('marks a conversation as idle after a turn, however the turn went', async () => {
    const { manager, workspace, events } = freshManager({ replies: ['Noted.'] })
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'hello')
    await manager.closeAll()

    expect(manager.list()[0]?.status).toBe('idle')
  })
})

describe('[runtime] naming a conversation', () => {
  it('renames it, and the new name survives a restart', async () => {
    const { manager, workspace, dataDirectory } = freshManager()
    const created = await manager.create(workspace)

    const renamed = manager.rename(created.conversation.id, 'The parser rewrite')
    expect(renamed.title).toBe('The parser rewrite')
    await manager.closeAll()

    const reopened = freshManagerAt(dataDirectory)
    expect(reopened.manager.list().map((conversation) => conversation.title)).toEqual(['The parser rewrite'])
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
})

describe('[runtime] deleting a conversation', () => {
  it('takes the transcript off the disk, not just off the list', async () => {
    const { manager, workspace, dataDirectory, events } = freshManager()
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'remember this')
    const sessionsRoot = join(dataDirectory, 'sessions')
    expect(existsSync(sessionsRoot)).toBe(true)

    const remaining = await manager.remove(created.conversation.id)

    expect(remaining).toEqual([])
    expect(() => manager.rename(created.conversation.id, 'still here')).toThrow()
    // Nothing is left on disk: no session directory with entries in it.
    const leftovers = readdirSync(sessionsRoot, { recursive: true })
    expect(leftovers.some((path) => String(path).endsWith('.jsonl'))).toBe(false)
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
    const { manager, workspace, events } = freshManager({ replies: ['The answer is 42.'] })
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'what is the answer')
    manager.rename(created.conversation.id, 'The answer')

    const { path } = await manager.exportMarkdown(created.conversation.id)

    expect(path).toBe(join(workspace, 'the-answer.md'))
    const markdown = readFileSync(path, 'utf8')
    expect(markdown).toContain('# The answer')
    expect(markdown).toContain('what is the answer')
    expect(markdown).toContain('The answer is 42.')
  })
})

/**
 * The gate is back on the path (ADR-0025), wired through the manager's own permission ports: the
 * broker holds the card, the unattended runs refuse theirs, and the runtime announces each verdict.
 */
describe('[runtime] the gate on the full path', () => {
  it('asks before a risky call, and the answer lets it run: the order the window sees', async () => {
    const { manager, workspace, events } = freshManager({
      toolCall: { name: 'bash', args: { command: 'echo manager-gate' } },
    })
    const created = await manager.create(workspace)

    const turn = manager.prompt(created.conversation.id, 'run it')
    await waitedFor(events, 'approval_requested')
    const request = events.find((event) => event.type === 'approval_requested')
    if (request?.type !== 'approval_requested') throw new Error('no approval was requested')
    manager.answerApproval(created.conversation.id, request.request.requestId, { decision: 'once' })
    await turn
    await waitedFor(events, 'turn_finished')
    await manager.closeAll()

    const kinds = events
      .map((event) => event.type)
      .filter((type) => ['tool_started', 'approval_requested', 'tool_decided', 'tool_finished'].includes(type))
    expect(kinds).toEqual(['tool_started', 'approval_requested', 'tool_decided', 'tool_finished'])
    const decided = events.find((event) => event.type === 'tool_decided')
    expect(decided?.type === 'tool_decided' ? decided.approval : {}).toMatchObject({ kind: 'once' })
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' ? finished.output : '').toContain('manager-gate')
  })

  it('a run with nobody watching has its ask refused at once, and the refusal is counted', async () => {
    const { manager, workspace, events } = freshManager({
      toolCall: { name: 'bash', args: { command: 'echo nobody-home' } },
    })
    const created = await manager.create(workspace)

    const refusals = await manager.runUnattended(created.conversation.id, 'run it')
    await manager.closeAll()

    expect(refusals).toBe(1)
    expect(events.some((event) => event.type === 'approval_requested')).toBe(false)
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' ? finished.output : '').toContain('Nobody is watching this run')
  })
})

const freshManagerAt = (
  dataDirectory: string,
  options: FixtureOptions = {},
): { manager: RuntimeManager; events: RuntimeEvent[] } => {
  const store = new StateStore(dataDirectory)
  const vault = new CredentialVault(dataDirectory, testCipher)
  const providers = new ProviderStore(dataDirectory, vault)
  if (options.noProviders !== true && providers.find('p') === undefined) providers.save(providerDefinition(false))
  const events: RuntimeEvent[] = []
  const manager = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers,
    store,
    agent: {
      sessionsRoot: join(dataDirectory, 'sessions'),
      keyProblem: () => options.keyProblem,
    },
    models: () => scriptedModels(scriptOf(options)),
    emit: (event) => events.push(event),
    emitRules: () => undefined,
  })
  return { manager, events }
}

describe('[runtime] reading a conversation back', () => {
  // The branch tip is what the window shows, and answering again moves it. A reader that walks
  // the whole log instead brings back the answer that was replaced, and the question with it.
  it('shows the answer that is on the branch, not the one regenerate replaced', async () => {
    const { manager, workspace, dataDirectory, events } = freshManager({ replies: REPLIES })
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'a question')
    await manager.regenerate(created.conversation.id)
    const live = await manager.transcriptFor(created.conversation.id)
    await manager.closeAll()

    const reopened = freshManagerAt(dataDirectory)
    const opened = await reopened.manager.open(created.conversation.id)
    await reopened.manager.closeAll()

    expect(texts(live)).toEqual(['a question', 'THE SECOND ANSWER'])
    expect(texts(opened.messages)).toEqual(texts(live))
  })

  it('shows the branch after an edit replaced what followed', async () => {
    const { manager, workspace, dataDirectory, events } = freshManager({ replies: REPLIES })
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'a question')
    await manager.editMessage(created.conversation.id, 0, 'a better question', 'replace')
    const live = await manager.transcriptFor(created.conversation.id)
    await manager.closeAll()

    const reopened = freshManagerAt(dataDirectory)
    const opened = await reopened.manager.open(created.conversation.id)
    await reopened.manager.closeAll()

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
    const { manager, workspace, events } = freshManager({ replies: REPLIES })
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'a question')
    await tell(manager, events, created.conversation.id, 'a second question')
    events.length = 0

    // No settling: the call resolving is the promise that the window has been told.
    await manager.editMessage(created.conversation.id, 0, 'a better question', 'replace')

    const replaced = events.filter((event) => event.type === 'transcript_replaced')
    expect(replaced).toHaveLength(1)
    const handed = replaced[0]?.type === 'transcript_replaced' ? replaced[0].messages : []
    expect(texts(handed)).toEqual(['a better question', 'THE SECOND ANSWER'])
  })

  it('leaves it alone when the edit forked instead, because this conversation did not change', async () => {
    const { manager, workspace, events } = freshManager({ replies: REPLIES })
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'a question')
    events.length = 0

    const forked = await manager.editMessage(created.conversation.id, 0, 'a better question', 'fork')
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(forked.conversation.id).not.toBe(created.conversation.id)
    // The copy is a conversation of its own, in the list, on a session of its own.
    expect(manager.list().map((one) => one.id)).toContain(forked.conversation.id)
    expect(forked.conversation.sessionId).not.toBe('')
    // The copy carries the edit and the script's first answer, which a fresh open hears again.
    expect(texts(forked.messages)).toEqual(['a better question', 'THE FIRST ANSWER'])
    expect(events.filter((event) => event.type === 'transcript_replaced')).toEqual([])
  })

  it('says nothing when a regenerate had nothing to run again', async () => {
    const { manager, workspace, events } = freshManager({ replies: REPLIES })
    const created = await manager.create(workspace)
    events.length = 0

    await manager.regenerate(created.conversation.id)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(events.filter((event) => event.type === 'transcript_replaced')).toEqual([])
  })

  it('takes an edit after a relaunch that followed a close mid-turn', async () => {
    // Closing the window mid-turn stops the run; what the agent had written by then is what the
    // session holds. The window's idea of it is a projection; the store is the fact, and the
    // conversation that is edited here is the one behind it.
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-data-'))
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const first = freshManagerAt(dataDirectory, { replies: ['The first answer.'] })
    const created = await first.manager.create(workspace)
    await tell(first.manager, first.events, created.conversation.id, 'a first question')

    // A turn that takes a while: the app closes while it is still being written.
    const slow = freshManagerAt(dataDirectory, {
      slowReply: { text: 'An answer long enough to be cut.', afterMs: 250 },
    })
    await slow.manager.prompt(created.conversation.id, 'a long task')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await slow.manager.closeAll()

    const second = freshManagerAt(dataDirectory, { replies: ['The corrected answer.'] })
    const opened = await second.manager.editMessage(created.conversation.id, 0, 'a better question', 'replace')
    await second.manager.closeAll()

    expect(texts(opened.messages)).toEqual(['a better question', 'The corrected answer.'])
  })
})

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
    // The provider store is the configured one here, because switching a model is a check against
    // the models Alpha serves rather than the scripted stand-in (#114).
    const collected: RuntimeEvent[] = []
    const { manager, workspace } = configuredManager(undefined, true, collected)
    const created = await manager.create(workspace)
    const id = created.conversation.id
    collected.length = 0

    manager.rename(id, 'The parser rewrite')
    expect(lastUpdate(collected, id)?.title).toBe('The parser rewrite')

    await manager.setThinkingLevel(id, 'high')
    expect(lastUpdate(collected, id)?.thinkingLevel).toBe('high')

    manager.setConversationLevel(id, 'plan')
    expect(lastUpdate(collected, id)?.permissionLevel).toBe('plan')

    await manager.setConversationModel(id, 'local', 'local-70b')
    expect(lastUpdate(collected, id)?.model).toEqual({ providerId: 'local', modelId: 'local-70b' })
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

describe('[runtime] putting a conversation away and taking it back', () => {
  it('archive hides it from the list, unarchive returns it', async () => {
    const { manager, workspace } = freshManager()
    const created = await manager.create(workspace)

    manager.archive(created.conversation.id)
    expect(manager.list().find((one) => one.id === created.conversation.id)?.archivedAt).toBeDefined()
    manager.unarchive(created.conversation.id)
    expect(manager.list().find((one) => one.id === created.conversation.id)?.archivedAt).toBeUndefined()
  })
})

describe('[runtime] compacting a conversation by hand', () => {
  it('compactConversation runs the compaction path, and the transcript shows the summary once', async () => {
    const { manager, workspace, events } = freshManager({
      replies: ['Noted.'],
      compactionSettings: { reserveTokens: 4, keepRecentTokens: 4 },
    })
    const created = await manager.create(workspace)
    await tell(manager, events, created.conversation.id, 'remember this')

    await expect(manager.compactConversation(created.conversation.id)).resolves.toBe(true)

    expect(events.some((event) => event.type === 'history_compacted')).toBe(true)
    const blocks = (await manager.transcriptFor(created.conversation.id)).flatMap((message) =>
      message.blocks.filter((block) => block.kind === 'compaction'),
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.kind).toBe('compaction')
  })
})
