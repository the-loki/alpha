import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyNetworkAccess, type PermissionRule } from '@alpha/core'
import { afterEach, describe, expect, it } from 'vitest'
import { Broadcast } from '../broadcast.ts'
import { type ChannelPorts, headlessWindowPort, type NetworkPort } from '../channels.ts'
import { CredentialVault, type SecretCipher } from '../providers/credential-vault.ts'
import { ProviderService } from '../providers/service.ts'
import { ProviderStore } from '../providers/store.ts'
import { RuntimeManager } from '../runtime/manager.ts'
import type { AgentPorts } from '../runtime/session-files.ts'
import { StateStore } from '../state-store.ts'
import { NetworkService, networkUrls } from './service.ts'

/** The agent a provider is tested through, pointed at the scripted one for the suite's sake. */
const agentPorts = (dataDirectory: string): AgentPorts => ({
  path: () => join(import.meta.dirname, '../../../tools/scripted-agent/pi.mjs'),
  directory: join(dataDirectory, 'agent'),
  env: { ALPHA_FAUX_REPLIES: JSON.stringify(['ready']) },
  sessionsRoot: join(dataDirectory, 'sessions'),
  credential: () => ({ env: {} }),
})

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

const services: NetworkService[] = []

const serviceWith = (options: { bundle?: boolean } = {}) => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-network-'))
  const bundleDirectory = mkdtempSync(join(tmpdir(), 'alpha-bundle-'))
  if (options.bundle !== false) {
    writeFileSync(join(bundleDirectory, 'index.html'), '<html>the workbench</html>', 'utf-8')
  }
  const store = new StateStore(dataDirectory)
  const vault = new CredentialVault(dataDirectory, testCipher)
  const runtime = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers: new ProviderStore(dataDirectory, vault),
    store,
    // The test seam: a scripted agent standing in for pi, with the script its model would answer.
    agent: {
      path: () => join(import.meta.dirname, '../../../../tools/scripted-agent/pi.mjs'),
      directory: join(dataDirectory, 'agent'),
      env: { ALPHA_FAUX_REPLIES: JSON.stringify(['Noted.']) },
      sessionsRoot: join(dataDirectory, 'sessions'),
      credential: () => ({ env: {} }),
    },
    emit: () => undefined,
    emitRules: (rules: PermissionRule[]) => void rules,
  })
  const service = new NetworkService({
    store,
    broadcast: new Broadcast(),
    bundleDirectory,
    ports: () =>
      ({
        store,
        runtime,
        providers: new ProviderService(new ProviderStore(dataDirectory, vault), {
          agent: agentPorts(dataDirectory),
          scratch: join(dataDirectory, 'scratch'),
        }),
        window: headlessWindowPort,
        network: stubNetwork,
        agent: {
          snapshot: async () => ({
            status: { kind: 'missing' },
            path: '',
            command: 'npm install',
            installing: false,
            output: '',
          }),
          setPath: async () => ({
            status: { kind: 'missing' },
            path: '',
            command: 'npm install',
            installing: false,
            output: '',
          }),
          install: async () => ({
            status: { kind: 'missing' },
            path: '',
            command: 'npm install',
            installing: false,
            output: '',
          }),
        },
        tasks: {
          snapshot: () => ({ tasks: [], runs: [] }),
          save: () => ({ tasks: [], runs: [] }),
          remove: () => ({ tasks: [], runs: [] }),
          runNow: async () => ({ tasks: [], runs: [] }),
        },
      }) satisfies ChannelPorts,
  })
  services.push(service)
  return { service, store, dataDirectory }
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()))
})

describe('[main] browser access', () => {
  it('does not listen until it is switched on', async () => {
    const { service, store } = serviceWith()

    expect(store.read().network).toEqual(emptyNetworkAccess())
    expect(service.state()).toMatchObject({ enabled: false, urls: [], error: '' })
    expect(await service.apply()).toMatchObject({ urls: [] })
  })

  it('listens when switched on, and says where', async () => {
    const { service } = serviceWith()

    const state = await service.set({ enabled: true, port: 0 })

    expect(state.enabled).toBe(true)
    // Bound to this machine: the loopback address is the only way in, whatever else this machine
    // has an address on, and it is the port the server actually took rather than the zero asked for.
    expect(state.urls).toHaveLength(1)
    expect(state.urls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(state.error).toBe('')
  })

  it('stops listening when it is switched off, and starts again when it is switched back on', async () => {
    const { service } = serviceWith()
    await service.set({ enabled: true, port: 0 })

    expect((await service.set({ enabled: false })).urls).toEqual([])
    expect((await service.set({ enabled: true })).urls).toHaveLength(1)
  })

  it('mints a token when it is switched on, and keeps it across a restart', async () => {
    const { service, store } = serviceWith()

    const first = await service.set({ enabled: true, port: 0 })
    expect(first.token.length).toBeGreaterThanOrEqual(32)

    await service.set({ enabled: false })
    expect((await service.set({ enabled: true })).token).toBe(first.token)

    const replaced = await service.regenerateToken()
    expect(replaced.token).not.toBe(first.token)
    expect(store.read().network.token).toBe(replaced.token)
  })

  it('says why it is not listening when the port belongs to something else', async () => {
    // Another client of this machine's port, not this workbench's own: a switch that frees the
    // port it is about to reuse would never collide with itself.
    const holder = serviceWith()
    const taken = Number((await holder.service.set({ enabled: true, port: 0 })).urls[0].split(':').at(-1))
    const other = serviceWith()

    const blocked = await other.service.set({ enabled: true, bind: 'local', port: taken })

    expect(blocked.error).toMatch(/EADDRINUSE|in use/i)
    expect(blocked.urls).toEqual([])
  })

  it('says what is missing when the interface has not been built', async () => {
    const { service } = serviceWith({ bundle: false })

    const state = await service.set({ enabled: true, port: 0 })

    expect(state.error).toMatch(/pnpm build/)
    expect(state.urls).toEqual([])
  })

  it('reports every address a browser could reach it on', () => {
    const interfaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [
        { address: '192.168.1.20', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
      ],
    } as unknown as ReturnType<typeof import('node:os').networkInterfaces>

    expect(networkUrls(4123, interfaces)).toEqual(['http://127.0.0.1:4123', 'http://192.168.1.20:4123'])
  })
})
