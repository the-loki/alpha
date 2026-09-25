import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scriptedModels, textStream } from '@alpha/agent/testing'
import { IPC } from '@alpha/contract'
import type { PermissionRule, TasksSnapshot, TurnRefusal, Undef } from '@alpha/domain'
import { CredentialVault, ProviderStore, type SecretCipher } from '@alpha/providers'
import { StateStore } from '@alpha/state'
import { TaskService, TaskStore } from '@alpha/tasks'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import { describe, expect, it } from 'vitest'
import {
  CHANNELS,
  type ChannelPorts,
  type McpPort,
  type NetworkPort,
  PUSHED_CHANNELS,
  type WindowPort,
} from './channels.ts'
import { ProviderService } from './providers/service.ts'
import { RuntimeManager } from './runtime/manager.ts'

/**
 * The table every transport dispatches through, driven without Electron: a real runtime over a
 * temporary data directory, a real provider store, and a window port that does nothing.
 */
const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

/** MCP in a test that is not about MCP: no servers, and nothing to reach. */
const stubMcp: McpPort = {
  snapshot: () => ({ servers: [] }),
  save: async () => ({ servers: [] }),
  remove: async () => ({ servers: [] }),
  reconnect: async () => ({ servers: [] }),
}

/** Browser access in a test that is not about browser access. */
const stubNetwork: NetworkPort = {
  state: () => ({ enabled: false, port: 4123, bind: 'local', token: '', urls: [], error: '' }),
  set: async () => stubNetwork.state(),
  regenerateToken: async () => stubNetwork.state(),
}

/** How many events of one kind the window was handed, which is how a test waits for the run. */
const turns = (events: unknown[], type: string): number =>
  events.filter((event) => (event as { type?: string }).type === type).length

const ports = (
  drives: Array<() => AssistantMessageEventStream> = [() => textStream('Noted.')],
  /** Which key refusal the run is answered with, when the test is about a turn that cannot start. */
  keyProblem: (providerId: string) => Undef<TurnRefusal> = () => undefined,
  retryDelays?: number[],
): ChannelPorts & { events: unknown[] } => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-channels-'))
  const events: unknown[] = []
  const store = new StateStore(dataDirectory)
  const vault = new CredentialVault(dataDirectory, testCipher)
  const window: WindowPort = {
    pickFolder: async () => ({ canceled: true, workspace: store.read().workspace.selection }),
    minimize: () => undefined,
    toggleMaximize: () => undefined,
    close: () => undefined,
  }
  // A configured provider the scripted model runtime answers for, so a prompt through the table
  // runs end to end without a network.
  const providers = new ProviderStore(dataDirectory, vault)
  providers.save({
    id: 'p',
    name: 'Scripted',
    api: 'openai-completions',
    baseUrl: 'https://llm.internal.example/v1',
    models: [{ id: 'm', name: 'M', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images: true }],
  })
  const runtime = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers,
    store,
    // The embedded agent, driven by a provider that streams from a script (ADR-0025's test seam).
    agent: { sessionsRoot: join(dataDirectory, 'sessions'), keyProblem },
    models: () => scriptedModels(drives),
    retryDelays,
    emit: (event) => events.push(event),
    emitRules: (rules: PermissionRule[]) => events.push(rules),
  })
  return {
    store,
    window,
    providers: new ProviderService(new ProviderStore(dataDirectory, vault)),
    mcp: stubMcp,
    network: stubNetwork,
    runtime,
    tasks: new TaskService({
      tasks: new TaskStore(dataDirectory),
      create: async (workspacePath) => (await runtime.create(workspacePath)).conversation.id,
      rename: (conversationId, title) => void runtime.rename(conversationId, title),
      setLevel: (conversationId, level) => void runtime.setConversationLevel(conversationId, level),
      runAttended: (conversationId, text) => runtime.runAttended(conversationId, text),
      runUnattended: (conversationId, text) => runtime.runUnattended(conversationId, text),
      workspaceExists: () => true,
      changed: () => undefined,
      now: () => new Date(),
    }),
    events,
  }
}

/** A drive that stays in flight for a while: the run is running, and the test can act inside it. */
const slowStream =
  (text: string, milliseconds: number): (() => AssistantMessageEventStream) =>
  () => {
    const stream = new AssistantMessageEventStream()
    stream.push({ type: 'start', partial: partialAssistant('', 'pending') })
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: partialAssistant(text, 'pending') })
    setTimeout(() => {
      stream.push({ type: 'done', reason: 'stop', message: partialAssistant(text, 'stop') })
    }, milliseconds)
    return stream
  }

const failingStream = (message: string, reason: 'error' | 'aborted'): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream()
  stream.push({ type: 'error', reason, error: { ...partialAssistant('', reason), errorMessage: message } })
  return stream
}

const partialAssistant = (text: string, stopReason: AssistantMessage['stopReason']): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
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
  stopReason,
  timestamp: Date.now(),
})

describe('[main] the queue the workbench owns', () => {
  it('a finished turn sends the next queued one, in order', async () => {
    const context = ports([
      slowStream('working on the first thing...', 120),
      () => textStream('the second answer.'),
      () => textStream('the third answer.'),
    ])
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-queue-'))
    const created = (await CHANNELS.createConversation(context, [workspace])) as { conversation: { id: string } }
    const id = created.conversation.id

    await CHANNELS.sendPrompt(context, [id, 'the first thing'])
    // Act inside the first turn: both messages wait behind it in the workbench's list.
    await expect.poll(() => turns(context.events, 'turn_started')).toBeGreaterThan(0)
    await CHANNELS.queueMessage(context, [id, 'the second thing'])
    await CHANNELS.queueMessage(context, [id, 'the third thing'])

    // The turns the queue started, one per message, and the transcript reading in the order sent.
    await expect.poll(() => turns(context.events, 'turn_finished')).toBe(3)
    const opened = (await CHANNELS.openConversation(context, [id])) as {
      messages: { role: string; blocks: { kind: string; text?: string }[] }[]
    }
    const said = opened.messages
      .filter((message) => message.role === 'user')
      .map((message) =>
        message.blocks
          .filter((block) => block.kind === 'text')
          .map((block) => block.text ?? '')
          .join(''),
      )
    expect(said).toEqual(['the first thing', 'the second thing', 'the third thing'])
  })

  it('a failed turn stops the queue instead of firing it into the same failure', { timeout: 30_000 }, async () => {
    const context = ports([
      () => textStream('Noted.'),
      () => textStream('Noted twice.'),
      () => failingStream('the endpoint is down', 'error'),
    ])
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-queue-'))
    const created = (await CHANNELS.createConversation(context, [workspace])) as { conversation: { id: string } }
    const id = created.conversation.id

    await CHANNELS.sendPrompt(context, [id, 'the first thing'])
    await expect.poll(() => turns(context.events, 'turn_started')).toBeGreaterThan(0)
    await CHANNELS.queueMessage(context, [id, 'the second thing'])
    await CHANNELS.queueMessage(context, [id, 'the third thing'])

    // The second went out; the third's turn failed, and the queue stopped rather than firing
    // whatever followed into the same failure.
    // The default retry budget (2s + 8s backoffs) is spent before the failure is announced.
    await expect.poll(() => turns(context.events, 'run_failed'), { timeout: 20_000 }).toBeGreaterThan(0)
    const last = context.events.filter((event) => (event as { type?: string }).type === 'queue_updated').at(-1)
    expect(last).toMatchObject({ paused: true, queued: [] })
  })
})

describe('[main] the channel table', () => {
  it('has a handler for every channel the contract names, and only for those', () => {
    const contract: string[] = Object.keys(IPC)
    const pushed: string[] = [...PUSHED_CHANNELS]
    const missing = contract.filter((name) => !pushed.includes(name) && !(name in CHANNELS))
    const extra = Object.keys(CHANNELS).filter((name) => !contract.includes(name))
    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('answers the launch state a window opens with', async () => {
    const state = (await CHANNELS.launchState(ports(), [])) as { platform: string; permissionLevel: string }
    expect(state.platform).toBe(process.platform)
    expect(state.permissionLevel).toBe('ask')
  })

  it('refuses arguments that are not what the channel promises', async () => {
    // Asynchronous handlers reject, synchronous ones throw; both are refusals at the boundary.
    await expect(CHANNELS.sendPrompt(ports(), ['', 'hello'])).rejects.toThrow(/conversationId/)
    expect(() => CHANNELS.editMessage(ports(), ['c1', 0, 'text', 'sideways'])).toThrow(/effect/)
    expect(() => CHANNELS.editMessage(ports(), ['c1', -1, 'text', 'replace'])).toThrow(/whole number/)
    expect(() => CHANNELS.answerApproval(ports(), [{ decision: 'maybe' }])).toThrow(/decision/)
    expect(() => CHANNELS.reconnectMcpServer(ports(), [7])).toThrow(/serverName/)
  })

  it('carries a picture through the table to the transcript it belongs to', async () => {
    const context = ports()
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-shot-'))
    const created = (await CHANNELS.createConversation(context, [workspace])) as {
      conversation: { id: string }
    }
    await CHANNELS.sendPrompt(context, [
      created.conversation.id,
      'what is wrong here',
      [{ name: 'shot.png', mimeType: 'image/png', data: 'AA==' }],
    ])
    // The run takes the message and writes it, and answering a prompt is not waiting for that: the
    // read below is of a conversation whose turn has started.
    await expect.poll(() => turns(context.events, 'user_message')).toBe(1)

    const opened = (await CHANNELS.openConversation(context, [created.conversation.id])) as {
      messages: { blocks: unknown[] }[]
    }
    expect(opened.messages[0].blocks).toEqual([
      { kind: 'text', text: 'what is wrong here' },
      { kind: 'attachment', mimeType: 'image/png', data: 'AA==' },
    ])
    await context.runtime.closeAll()
  })

  it('takes a picture with nothing typed as a message of its own', async () => {
    const context = ports()
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-shot-only-'))
    const created = (await CHANNELS.createConversation(context, [workspace])) as {
      conversation: { id: string }
    }
    await CHANNELS.sendPrompt(context, [created.conversation.id, '', [{ mimeType: 'image/png', data: 'AA==' }]])
    await expect.poll(() => turns(context.events, 'user_message')).toBe(1)

    const opened = (await CHANNELS.openConversation(context, [created.conversation.id])) as {
      messages: { blocks: unknown[] }[]
    }
    expect(opened.messages[0].blocks).toEqual([{ kind: 'attachment', mimeType: 'image/png', data: 'AA==' }])
    // And nothing at all is still nothing: an empty message is refused rather than sent.
    await expect(CHANNELS.sendPrompt(context, [created.conversation.id, '   ', []])).rejects.toThrow(
      /words or a picture/,
    )
    await context.runtime.closeAll()
  })

  it('refuses an attachment that is not a picture, or is too large to send', async () => {
    const context = ports()
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-refuse-'))
    const created = (await CHANNELS.createConversation(context, [workspace])) as {
      conversation: { id: string }
    }
    const id = created.conversation.id

    await expect(
      CHANNELS.sendPrompt(context, [id, 'hello', [{ mimeType: 'text/html', data: 'AA==' }]]),
    ).rejects.toThrow(/not a picture/)
    // Four base64 characters are three bytes, so this is a shade over the ceiling.
    const huge = 'A'.repeat(Math.ceil(((4 * 1024 * 1024 + 3) / 3) * 4))
    await expect(CHANNELS.sendPrompt(context, [id, 'hello', [{ mimeType: 'image/png', data: huge }]])).rejects.toThrow(
      /too large/,
    )
    await expect(CHANNELS.sendPrompt(context, [id, 'hello', 'not a list'])).rejects.toThrow(/list/)
    await context.runtime.closeAll()
  })

  it('asks the window port for a folder, so a client without one can refuse', async () => {
    const context = ports()
    const asked: string[] = []
    context.window = {
      ...context.window,
      pickFolder: async () => {
        asked.push('asked')
        return { canceled: true, workspace: context.store.read().workspace.selection }
      },
    }

    await CHANNELS.pickWorkspace(context, [])

    expect(asked).toEqual(['asked'])
  })

  it('writes the chosen workspace down, so the next launch comes back to it', async () => {
    const context = ports()
    const state = (await CHANNELS.selectWorkspace(context, ['/tmp/a-workspace'])) as {
      workspace: { kind: string; workspace?: { path: string } }
    }

    expect(state.workspace.kind).toBe('selected')
    expect(state.workspace.workspace?.path).toBe('/tmp/a-workspace')
    expect(context.store.read().workspace.recents.map((ref) => ref.path)).toEqual(['/tmp/a-workspace'])
  })

  it('rejects a permission level it does not recognise, and takes the ones it does', async () => {
    const context = ports()
    const before = (await CHANNELS.launchState(context, [])) as { permissionLevel: string }
    await CHANNELS.setPermissionLevel(context, ['nonsense'])
    expect(((await CHANNELS.launchState(context, [])) as { permissionLevel: string }).permissionLevel).toBe(
      before.permissionLevel,
    )

    await CHANNELS.setPermissionLevel(context, ['plan'])
    expect(((await CHANNELS.launchState(context, [])) as { permissionLevel: string }).permissionLevel).toBe('plan')
  })

  it('carries the language through the appearance patch, and refuses one it does not have', async () => {
    const context = ports()
    const before = (await CHANNELS.launchState(context, [])) as { language: string }
    expect(before.language).toBe('system')

    const changed = (await CHANNELS.setAppearance(context, [{ language: 'zh' }])) as { language: string }
    expect(changed.language).toBe('zh')
    // Written down, not just reported: the choice has to survive the window that made it.
    expect(context.store.read().language).toBe('zh')

    expect(() => CHANNELS.setAppearance(context, [{ language: 'de' }])).toThrow(/language/)
    expect(context.store.read().language).toBe('zh')
  })

  it('answers a turn that was refused with the case, and tells the window about it too', async () => {
    // A refusal is a value rather than a throw: the window is told as an event — which is
    // where it draws the case in its own language — and whoever asked is answered with which case it
    // was, so a caller knows the turn never started. Nothing is thrown for something that is not a
    // mistake by the caller.
    const context = ports(undefined, () => ({ kind: 'no-key', providerId: 'p' }))
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-refused-'))
    const created = (await CHANNELS.createConversation(context, [workspace])) as {
      conversation: { id: string }
    }

    const refusal = await CHANNELS.sendPrompt(context, [created.conversation.id, 'hello'])

    expect(refusal).toEqual({ kind: 'no-key', providerId: 'p' })
    expect(context.events).toContainEqual({
      conversationId: created.conversation.id,
      type: 'turn_refused',
      refusal: { kind: 'no-key', providerId: 'p' },
    })
    expect(turns(context.events, 'turn_started')).toBe(0)
    await context.runtime.closeAll()
  })

  it('runs a conversation end to end through the table alone', async () => {
    const context = ports()
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-ws-'))
    const created = (await CHANNELS.createConversation(context, [workspace])) as {
      conversation: { id: string }
    }
    await CHANNELS.sendPrompt(context, [created.conversation.id, 'hello'])

    const listed = (await CHANNELS.listConversations(context, [])) as { id: string }[]
    expect(listed.map((conversation) => conversation.id)).toContain(created.conversation.id)
    await context.runtime.closeAll()
  })
})

describe('[main] task runs through the channel table', () => {
  it('answers a manual run only after its model turn has finished', async () => {
    const context = ports([slowStream('finished the task', 200)])
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-task-'))
    const saved = CHANNELS.saveTask(context, [
      { name: 'Daily check', prompt: 'check this', workspacePath: workspace },
    ]) as TasksSnapshot

    const result = (await CHANNELS.runTaskNow(context, [saved.tasks[0].id])) as TasksSnapshot

    expect(turns(context.events, 'turn_finished')).toBe(1)
    expect(result.runs[0]).toMatchObject({ taskId: saved.tasks[0].id, outcome: 'ok' })
    await context.runtime.closeAll()
  })

  it('records a manual run as failed when its model turn fails after retry', async () => {
    const context = ports(
      [() => failingStream('temporary error', 'error'), () => failingStream('final error', 'error')],
      undefined,
      [0],
    )
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-channels-task-failed-'))
    const saved = CHANNELS.saveTask(context, [
      { name: 'Daily check', prompt: 'check this', workspacePath: workspace },
    ]) as TasksSnapshot

    const result = (await CHANNELS.runTaskNow(context, [saved.tasks[0].id])) as TasksSnapshot

    expect(turns(context.events, 'run_failed')).toBe(1)
    expect(result.runs[0]).toMatchObject({ taskId: saved.tasks[0].id, outcome: 'failed' })
    await context.runtime.closeAll()
  })
})
