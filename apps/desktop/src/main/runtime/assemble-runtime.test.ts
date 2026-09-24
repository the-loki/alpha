import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aModel, scriptedModels, textStream, toolUseStream } from '@alpha/agent/testing'
import type { ConversationSummary, PermissionLevel, RuntimeEvent } from '@alpha/domain'
import type { PermissionPorts } from '@alpha/gate'
import type { McpServers } from '@alpha/mcp'
import { CredentialVault, ProviderStore, type SecretCipher } from '@alpha/providers'
import { DecisionLog, SessionStore } from '@alpha/sessions'
import type { Api, Model } from '@earendil-works/pi-ai'
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import { describe, expect, it } from 'vitest'
import { openRuntime } from './assemble-runtime.ts'
import type { ConversationRuntime } from './conversation-runtime.ts'

/**
 * What a real opening assembles (ADR-0025): the workspace tools and their gate are always present.
 */

const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

const provider = {
  id: 'p',
  name: 'Scripted',
  api: 'openai-completions' as const,
  baseUrl: 'https://llm.internal.example/v1',
  models: [{ id: 'm', name: 'M', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images: false }],
}

const conversationIn = (workspace: string): ConversationSummary => ({
  id: 'c1',
  workspacePath: workspace,
  title: 'Wired',
  createdAt: 1,
  updatedAt: 1,
  status: 'idle',
  permissionLevel: 'ask',
  model: { providerId: 'p', modelId: 'm' },
  thinkingLevel: 'off',
})

const permissionsAt = (level: PermissionLevel): PermissionPorts => ({
  level: () => level,
  rules: () => [],
  remember: () => undefined,
  ask: async () => ({ decision: 'deny' }),
})

interface OpenOptions {
  drives: Array<() => AssistantMessageEventStream>
  catalog?: readonly Model<Api>[]
  /** The answer to a call that the gate asks about. */
  ports?: Pick<PermissionPorts, 'ask'>
  level?: PermissionLevel
  /** The backoff the assembled retry policy waits with, shrunk for the test. */
  retryDelays?: number[]
  mcp?: McpServers
}

const opened = async (
  options: OpenOptions,
): Promise<{ runtime: ConversationRuntime; events: RuntimeEvent[]; asked: string[] }> => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-data-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const providers = new ProviderStore(dataDirectory, new CredentialVault(dataDirectory, testCipher))
  providers.save(provider)
  const events: RuntimeEvent[] = []
  const conversation = conversationIn(workspace)
  const level = options.level ?? 'ask'
  const ports = options.ports
  const asked: string[] = []
  const runtime = await openRuntime({
    conversation,
    sessions: new SessionStore(join(dataDirectory, 'sessions')),
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers,
    models: () => scriptedModels(options.drives, options.catalog),
    decisions: new DecisionLog(dataDirectory).opened(conversation.id),
    mcp: options.mcp,
    retryDelays: options.retryDelays,
    permissions: () => ({
      ...permissionsAt(level),
      ask: async (conversationId: string, ask: Parameters<PermissionPorts['ask']>[1]) => {
        asked.push(ask.callId)
        return ports?.ask(conversationId, ask) ?? { decision: 'deny' }
      },
    }),
    emit: (event) => events.push(event),
  })
  return { runtime, events, asked }
}

const runAndSettle = async (runtime: ConversationRuntime, text: string): Promise<void> => {
  await runtime.prompt(text)
  await runtime.settle()
  await runtime.close()
}

describe('[runtime] what an opening assembles', () => {
  it('does not run a different model when the configured one is absent from the model runtime', async () => {
    const { runtime, events } = await opened({
      drives: [() => textStream('wrong model')],
      catalog: [{ ...aModel(), id: 'other' }],
    })

    await expect(runtime.prompt('hello')).resolves.toEqual({ kind: 'no-model' })
    expect(events.filter((event) => event.type === 'turn_started')).toEqual([])
    await runtime.close()
  })

  it('releases its MCP tool subscription when the conversation closes', async () => {
    const listeners = new Set<() => void>()
    const mcp: McpServers = {
      tools: () => [],
      call: async () => ({ content: [], isError: false }),
      outcomes: () => [],
      reconfigure: async () => {},
      reconnect: async () => {},
      onToolsChanged: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      close: async () => {},
    }
    const { runtime } = await opened({ drives: [], mcp })

    expect(listeners.size).toBe(1)
    await runtime.close()
    expect(listeners.size).toBe(0)
  })

  it('a Plan conversation cannot run bash through the assembled runtime', async () => {
    const { runtime, events, asked } = await opened({
      level: 'plan',
      drives: [() => toolUseStream('bash', { command: 'echo must-not-run' }), () => endOf('Done.')],
    })

    await runAndSettle(runtime, 'run it')

    expect(asked).toEqual([])
    const decided = events.find((event) => event.type === 'tool_decided')
    expect(decided?.type === 'tool_decided' ? decided.approval.kind : '').toBe('blocked')
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' ? finished.status : '').toBe('failed')
  })

  it('ports on the opening put the gate on the path, and the announcement rides the runtime', async () => {
    const { runtime, events, asked } = await opened({
      drives: [() => toolUseStream('bash', { command: 'echo gated' }), () => endOf('Done.')],
      ports: { ask: async () => ({ decision: 'once' }) },
    })

    await runAndSettle(runtime, 'run it')

    expect(asked).toEqual(['call-1'])
    const kinds = events
      .map((event) => event.type)
      .filter((type) => ['tool_started', 'tool_decided', 'tool_finished'].includes(type))
    expect(kinds).toEqual(['tool_started', 'tool_decided', 'tool_finished'])
    const decided = events.find((event) => event.type === 'tool_decided')
    expect(decided?.type === 'tool_decided' ? decided.approval.kind : '').toBe('once')
  })
})

/** One scripted drive that says `text` and stops, plain enough to not need the provider module. */
const endOf = (text: string): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream()
  stream.push({
    type: 'done',
    reason: 'stop',
    message: {
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
    },
  })
  return stream
}

describe('[runtime] the policies an opening assembles', () => {
  const waitedFor = async (events: RuntimeEvent[], kind: string): Promise<void> => {
    for (let attempt = 0; attempt < 300 && !events.some((event) => event.type === kind); attempt += 1) {
      await new Promise((done) => setTimeout(done, 10))
    }
  }

  it('an overflow compacts on the assembled path, and a reopen folds the same way', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-data-'))
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const sessionsRoot = join(dataDirectory, 'sessions')
    const providers = new ProviderStore(dataDirectory, new CredentialVault(dataDirectory, testCipher))
    providers.save(provider)
    const events: RuntimeEvent[] = []
    const store = new SessionStore(sessionsRoot)
    const open = (drives: Array<() => AssistantMessageEventStream>) =>
      openRuntime({
        conversation: conversationIn(workspace),
        sessions: store,
        sessionsRoot,
        providers,
        models: () => scriptedModels(drives, [{ ...aModel(), contextWindow: 5 }]),
        decisions: new DecisionLog(dataDirectory).opened('c1'),
        permissions: () => permissionsAt('ask'),
        compactionSettings: { enabled: true, reserveTokens: 4, keepRecentTokens: 0 },
        emit: (event) => events.push(event),
      })

    const first = await open([() => endOf('Hello there.'), () => endOf('They were fixing a parser.')])
    await first.prompt('fix the parser')
    await first.settle()
    await waitedFor(events, 'history_compacted')
    await first.close()

    const said = events.find((event) => event.type === 'history_compacted')
    expect(said?.type === 'history_compacted' ? said.summary : '').toBe('They were fixing a parser.')
    expect(said?.type === 'history_compacted' ? said.replaced : 0).toBe(2)

    // A reopened conversation is the compacted conversation, and the block is on screen once.
    const second = await open([() => endOf('again')])
    const blocks = store
      .transcript('c1', workspace)
      .flatMap((message) => message.blocks.filter((block) => block.kind === 'compaction'))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'compaction', summary: 'They were fixing a parser.', replaced: 2 })
    await second.close()
  })

  it('a healthy run under the threshold compacts nothing', async () => {
    const { runtime, events } = await opened({ drives: [() => endOf('Noted.')] })

    await runAndSettle(runtime, 'remember this')

    expect(events.some((event) => event.type === 'history_compacted')).toBe(false)
  })

  it('a transient failure on the assembled path retries inside the same turn', async () => {
    const { runtime, events } = await opened({
      drives: [() => failing('503 Service Unavailable'), () => endOf('recovered')],
      retryDelays: [0, 0],
    })

    await runAndSettle(runtime, 'fix the parser')

    const kinds = events.map((event) => event.type)
    expect(kinds.filter((type) => type === 'turn_started')).toHaveLength(1)
    expect(kinds.filter((type) => type === 'turn_finished')).toHaveLength(1)
    expect(kinds).not.toContain('run_failed')
    // The retry continues the run rather than being given the message again, so the one question
    // is in the conversation once: a second user message here would be the same words said twice.
    expect(kinds.filter((type) => type === 'user_message')).toHaveLength(1)
  })

  it('an authentication failure ends the turn without another provider request', async () => {
    const drives = [() => failing('401 Unauthorized'), () => endOf('should not be requested')]
    const { runtime, events } = await opened({ drives, retryDelays: [0, 0] })

    await runAndSettle(runtime, 'fix the parser')

    expect(drives).toHaveLength(1)
    expect(events.filter((event) => event.type === 'run_failed')).toEqual([
      { conversationId: 'c1', type: 'run_failed', message: '401 Unauthorized' },
    ])
    expect(events.some((event) => event.type === 'turn_finished')).toBe(false)
  })

  // A provider that fails without a sentence of its own is still a failed run, and both ends of it
  // have to read the same thing: the window's `run_failed` says the run failed — the words for it
  // are the window's, in its own language — and the retry policy is asked about exactly that
  // reading. Read the failure twice — once off pi's event, once off the agent's own field, which
  // holds a sentence only when there is one — and a run comes to be neither retried nor reported:
  // the composer waits for a turn that is already over.
  it('a failure with nothing to say of its own is retried, and ends the turn', async () => {
    const { runtime, events } = await opened({
      drives: [() => failing(''), () => textStream('recovered')],
      retryDelays: [0, 0],
    })

    await runAndSettle(runtime, 'fix the parser')

    const kinds = events.map((event) => event.type)
    expect(kinds.filter((type) => type === 'turn_finished')).toHaveLength(1)
    // The retry really was taken: what the second drive streamed is what the window read.
    const said = events
      .filter((event) => event.type === 'assistant_text_delta')
      .map((event) => (event.type === 'assistant_text_delta' ? event.delta : ''))
      .join('')
    expect(said).toContain('recovered')
    expect(kinds).not.toContain('run_failed')
  })

  // The other end of the same failure: with no retry waiting, a run that failed without a sentence
  // is reported as a failure and nothing more. What is drawn for it then is the window's own
  // sentence, in the language the window is in, so the event must not carry words of its own.
  it('reports a failure with nothing to say as a failure, and says nothing with it', async () => {
    const { runtime, events } = await opened({
      drives: [() => failing(''), () => failing(''), () => failing('')],
      retryDelays: [0, 0],
    })

    await runAndSettle(runtime, 'fix the parser')

    expect(events.find((event) => event.type === 'run_failed')).toStrictEqual({
      conversationId: 'c1',
      type: 'run_failed',
    })
  })
})

/** One scripted drive that fails the way a provider hiccup does. */
const failing = (message: string): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream()
  stream.push({
    type: 'error',
    reason: 'error',
    error: {
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      api: 'openai-completions',
      provider: 'p',
      model: 'm',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'error',
      errorMessage: message,
      timestamp: Date.now(),
    },
  })
  return stream
}
