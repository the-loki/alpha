import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC, type PermissionRule } from '@alpha/core'
import { afterEach, describe, expect, it } from 'vitest'
import { Broadcast } from '../broadcast.ts'
import { type ChannelPorts, headlessWindowPort, type NetworkPort } from '../channels.ts'
import { CredentialVault, type SecretCipher } from '../providers/credential-vault.ts'
import { ProviderService } from '../providers/service.ts'
import { ProviderStore } from '../providers/store.ts'
import { RuntimeManager } from '../runtime/manager.ts'
import { scriptedModels, textStream } from '../runtime/scripted-provider.ts'
import { StateStore } from '../state-store.ts'
import { type RunningServer, startServer } from './http.ts'
import { COOKIE_NAME } from './session.ts'

/** Browser access in a test that is not about browser access. */
const stubNetwork: NetworkPort = {
  state: () => ({ enabled: false, port: 4123, bind: 'local', token: '', urls: [], error: '' }),
  set: async () => stubNetwork.state(),
  regenerateToken: async () => stubNetwork.state(),
}

/**
 * The server driven over a real socket: a temporary bundle to serve, an ephemeral port, a real
 * runtime behind the table, and a scripted model. Nothing here is mocked except the model.
 */
const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

const bundleWith = (files: Record<string, string>): string => {
  const bundle = mkdtempSync(join(tmpdir(), 'alpha-bundle-'))
  for (const [name, content] of Object.entries(files)) {
    const path = join(bundle, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content, 'utf-8')
  }
  return bundle
}

const servers: RunningServer[] = []

const start = async (
  options: {
    token?: string
    bundle?: Record<string, string>
    /** A bundle that is already on disk, for the tests that plant something in it. */
    bundleDirectory?: string
    broadcast?: Broadcast
  } = {},
) => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-server-'))
  const events: unknown[] = []
  const vault = new CredentialVault(dataDirectory, testCipher)
  const store = new StateStore(dataDirectory)
  // A configured provider the scripted model runtime answers for, so a browser prompt runs end
  // to end without a network.
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
    // The test seam: the slim ports the embedded runtime needs, with no agent program behind it.
    agent: {
      sessionsRoot: join(dataDirectory, 'sessions'),
      keyProblem: () => undefined,
    },
    models: () => scriptedModels([() => textStream('Noted.')]),
    emit: (event) => events.push(event),
    emitRules: (rules: PermissionRule[]) => events.push(rules),
  })
  const ports: ChannelPorts = {
    store,
    runtime,
    providers: new ProviderService(new ProviderStore(dataDirectory, vault)),
    window: headlessWindowPort,
    network: stubNetwork,
    tasks: {
      snapshot: () => ({ tasks: [], runs: [] }),
      save: () => ({ tasks: [], runs: [] }),
      remove: () => ({ tasks: [], runs: [] }),
      runNow: async () => ({ tasks: [], runs: [] }),
    },
  }
  const broadcast = options.broadcast ?? new Broadcast()
  const server = await startServer({
    ports,
    broadcast,
    token: options.token ?? 'a-token-that-is-long-enough-to-be-one',
    bundleDirectory:
      options.bundleDirectory ?? bundleWith(options.bundle ?? { 'index.html': '<html>the workbench</html>' }),
    port: 0,
    bind: 'local',
  })
  servers.push(server)
  return { ...server, runtime, broadcast, events }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('[main] the workbench server', () => {
  it('serves the bundle to anyone, and nothing else from disk', async () => {
    const { url } = await start({ bundle: { 'index.html': '<html>the workbench</html>', 'a.js': 'export {}' } })

    const index = await fetch(`${url}/`)
    expect(index.status).toBe(200)
    expect(await index.text()).toContain('the workbench')

    const asset = await fetch(`${url}/a.js`)
    expect(asset.status).toBe(200)
    expect(await asset.text()).toBe('export {}')

    // Walking out of the bundle is refused rather than resolved. Encoded, because a plain `../`
    // never reaches the server: the client normalises it away, and that proves nothing.
    const outside = await fetch(`${url}/..%2f..%2f..%2f..%2fetc%2fpasswd`)
    expect(outside.status).toBe(404)
    expect(await outside.text()).not.toContain('root:')

    // A route the app renders gets the shell; that is what the fallback is for.
    const route = await fetch(`${url}/conversations/anything`)
    expect(route.status).toBe(200)
    expect(await route.text()).toContain('the workbench')
  })

  it('refuses a symlink inside the bundle that points out of it', async () => {
    const secret = join(mkdtempSync(join(tmpdir(), 'alpha-outside-')), 'a-secret.txt')
    writeFileSync(secret, 'not for browsers', 'utf-8')

    const bundle = bundleWith({ 'index.html': '<html>the workbench</html>' })
    // A name inside the bundle that resolves to a file outside it: the path check alone is happy
    // with it, because the path is inside until the filesystem says otherwise.
    symlinkSync(secret, join(bundle, 'escape.txt'))

    const { url: served } = await start({ bundleDirectory: bundle })
    const escaped = await fetch(`${served}/escape.txt`)
    expect(escaped.status).toBe(404)
    expect(await escaped.text()).not.toContain('not for browsers')

    // A symlink that stays inside is still the bundle's own file, and is served.
    symlinkSync(join(bundle, 'index.html'), join(bundle, 'same.html'))
    const inside = await fetch(`${served}/same.html`)
    expect(inside.status).toBe(200)
  })

  it('refuses every API call without a session, and the token is the only way in', async () => {
    const { url } = await start()

    const anonymous = await fetch(`${url}/api/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: IPC.launchState, args: [] }),
    })
    expect(anonymous.status).toBe(401)

    const wrong = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'not the token' }),
    })
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get('set-cookie')).toBeNull()
  })

  it('trades the token for a session, and the session answers a channel', async () => {
    const { url } = await start()
    const cookie = await unlock(url, 'a-token-that-is-long-enough-to-be-one')
    expect(cookie).toContain(COOKIE_NAME)

    const state = await invoke(url, cookie, IPC.launchState, [])
    expect(state).toMatchObject({ permissionLevel: 'ask' })
  })

  it('takes the token as a bearer header too, which is how a script uses it', async () => {
    const { url } = await start()
    const response = await fetch(`${url}/api/invoke`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer a-token-that-is-long-enough-to-be-one',
      },
      body: JSON.stringify({ channel: IPC.launchState, args: [] }),
    })

    expect(response.status).toBe(200)
  })

  it('refuses a channel that is not in the contract, and arguments that do not fit one', async () => {
    const { url } = await start()
    const cookie = await unlock(url, 'a-token-that-is-long-enough-to-be-one')

    expect(await invokeStatus(url, cookie, 'alpha:take-over-the-world', [])).toBe(400)
    expect(await invokeStatus(url, cookie, IPC.sendPrompt, ['only-one-argument'])).toBe(400)
  })

  it('runs a conversation for a browser client', async () => {
    const { url } = await start()
    const cookie = await unlock(url, 'a-token-that-is-long-enough-to-be-one')
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-server-ws-'))

    const created = (await invoke(url, cookie, IPC.createConversation, [workspace])) as {
      conversation: { id: string }
    }
    await invoke(url, cookie, IPC.sendPrompt, [created.conversation.id, 'hello'])
    const listed = (await invoke(url, cookie, IPC.listConversations, [])) as { id: string }[]

    expect(listed.map((conversation) => conversation.id)).toContain(created.conversation.id)
  })

  it('refuses the folder picker, because a browser has no machine to pick from', async () => {
    const { url } = await start()
    const cookie = await unlock(url, 'a-token-that-is-long-enough-to-be-one')

    const refused = await fetch(`${url}/api/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ channel: IPC.pickWorkspace, args: [] }),
    })

    expect(refused.status).toBe(400)
    expect(await refused.text()).toMatch(/desktop/i)
  })

  it('streams what main pushes, to a browser that is holding a session', async () => {
    const broadcast = new Broadcast()
    const { url } = await start({ broadcast })
    const cookie = await unlock(url, 'a-token-that-is-long-enough-to-be-one')

    const stream = await fetch(`${url}/api/events`, { headers: { cookie } })
    expect(stream.status).toBe(200)
    const reader = stream.body?.getReader()
    expect(reader).toBeDefined()

    broadcast.send('runtimeEvent', { conversationId: 'c1', type: 'turn_started' })

    const frame = await readUntil(reader as ReadableStreamDefaultReader<Uint8Array>, 'turn_started')
    expect(frame).toContain('event: runtimeEvent')
    expect(frame).toContain('"type":"turn_started"')
    await reader?.cancel()
  })

  it('refuses the event stream without a session', async () => {
    const { url } = await start()
    expect((await fetch(`${url}/api/events`)).status).toBe(401)
  })
})

async function unlock(url: string, token: string): Promise<string> {
  const response = await fetch(`${url}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  expect(response.status).toBe(200)
  const cookie = response.headers.get('set-cookie') ?? ''
  return cookie.slice(0, cookie.indexOf(';'))
}

async function invoke(url: string, cookie: string, channel: string, args: unknown[]): Promise<unknown> {
  // Everything a client sends is the contract's channel string, never the table's key.
  const response = await fetch(`${url}/api/invoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ channel, args }),
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { value: unknown }
  return body.value
}

async function invokeStatus(url: string, cookie: string, channel: string, args: unknown[]): Promise<number> {
  const response = await fetch(`${url}/api/invoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ channel, args }),
  })
  return response.status
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
  timeoutMs = 4000,
): Promise<string> {
  const decoder = new TextDecoder()
  let seen = ''
  const started = Date.now()
  while (!seen.includes(needle)) {
    if (Date.now() - started > timeoutMs) throw new Error(`the stream never said ${needle}`)
    const chunk = await reader.read()
    if (chunk.done) break
    seen += decoder.decode(chunk.value)
  }
  return seen
}
