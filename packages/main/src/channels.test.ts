import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC, type PermissionRule } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { CHANNELS, type ChannelPorts, type NetworkPort, PUSHED_CHANNELS, type WindowPort } from './channels.ts'
import { CredentialVault, type SecretCipher } from './providers/credential-vault.ts'
import { ProviderService } from './providers/service.ts'
import { ProviderStore } from './providers/store.ts'
import { RuntimeManager } from './runtime/manager.ts'
import { StateStore } from './state-store.ts'
import { TaskService } from './tasks/service.ts'
import { TaskStore } from './tasks/store.ts'

/**
 * The table every transport dispatches through, driven without Electron: a real runtime over a
 * temporary data directory, a real provider store, and a window port that does nothing.
 */
const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

/** Browser access in a test that is not about browser access. */
const stubNetwork: NetworkPort = {
  state: () => ({ enabled: false, port: 4123, bind: 'local', token: '', urls: [], error: '' }),
  set: async () => stubNetwork.state(),
  regenerateToken: async () => stubNetwork.state(),
}

const ports = (): ChannelPorts & { events: unknown[] } => {
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
  const runtime = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers: new ProviderStore(dataDirectory, vault),
    store,
    env: { ALPHA_FAUX: '1', ALPHA_FAUX_REPLIES: JSON.stringify(['Noted.']) },
    emit: (event) => events.push(event),
    emitRules: (rules: PermissionRule[]) => events.push(rules),
  })
  return {
    store,
    window,
    providers: new ProviderService(new ProviderStore(dataDirectory, vault)),
    network: stubNetwork,
    runtime,
    tasks: new TaskService({
      tasks: new TaskStore(dataDirectory),
      create: async (workspacePath) => (await runtime.create(workspacePath)).conversation.id,
      rename: (conversationId, title) => void runtime.rename(conversationId, title),
      setLevel: (conversationId, level) => void runtime.setConversationLevel(conversationId, level),
      prompt: (conversationId, text) => runtime.prompt(conversationId, text),
      runUnattended: (conversationId, text) => runtime.runUnattended(conversationId, text),
      workspaceExists: () => true,
      changed: () => undefined,
      now: () => new Date(),
    }),
    events,
  }
}

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
