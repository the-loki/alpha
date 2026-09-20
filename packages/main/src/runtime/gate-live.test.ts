import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentRpc, rpcArgs, rpcEnv } from '../agent-cli/rpc.ts'
import { CredentialVault, type SecretCipher } from '../providers/credential-vault.ts'
import { ProviderStore } from '../providers/store.ts'
import { credentialVariable, writeModelsFile } from './agent-models.ts'
import { ensureGateExtension } from './gate-extension.ts'
import { importLegacySessionIn } from './legacy-sessions.ts'

/**
 * The one thing a scripted agent cannot show: that the agent Alpha actually runs asks Alpha's gate.
 *
 * This drives a real `pi` — the one the person installed, named by `ALPHA_LIVE_PI` — against a
 * model endpoint that answers in a script, and checks the round trip the spike proved: the agent
 * loads Alpha's extension, puts the call to Alpha, and hands the model Alpha's refusal as the
 * tool's result. It is skipped unless the binary is named, because the machine that runs the unit
 * suite has no reason to have an agent installed.
 */
const LIVE_PI = process.env.ALPHA_LIVE_PI ?? ''

const FAKE_PROVIDER = join(import.meta.dirname, '../../../../tools/fake-provider/server.mjs')
const SECRET = 'sk-live-test-key'

const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

const running: Array<ChildProcess | AgentRpc> = []

afterEach(async () => {
  for (const child of running.splice(0)) {
    if (child instanceof AgentRpc) await child.close()
    else child.kill('SIGTERM')
  }
})

/** The scripted model endpoint, answering its port on stdout once it is listening. */
async function fakeProvider(): Promise<{ baseUrl: string; captured: () => Promise<unknown[]> }> {
  const server = spawn('node', [FAKE_PROVIDER], {
    env: { ...process.env, FAKE_TOOL_CALL: JSON.stringify({ name: 'bash', arguments: { command: 'echo hello' } }) },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  running.push(server)
  const port = await new Promise<string>((settle) => {
    server.stdout?.once('data', (chunk: Buffer) => settle(chunk.toString().trim()))
  })
  const baseUrl = `http://127.0.0.1:${port}/v1`
  return {
    baseUrl,
    captured: async () => (await (await fetch(`http://127.0.0.1:${port}/captured`)).json()) as unknown[],
  }
}

describe.skipIf(LIVE_PI === '')('[runtime] the gate, against the agent the person installed', () => {
  it('opens a conversation the previous Alpha wrote, and carries on in its own format', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-live-'))
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-live-ws-'))
    const agentDirectory = join(dataDirectory, 'agent')
    const sessions = join(dataDirectory, 'sessions')
    const model = await fakeProvider()
    const previous = join(sessions, '2026-01-01T00-00-00-000Z', 'x')
    // The previous Alpha's file: its header, and one exchange in it.
    mkdirSync(previous, { recursive: true })
    const conversationId = 'legacy-conversation'
    writeFileSync(
      join(previous, `2026-01-01T00-00-00-000Z_${conversationId}.jsonl`),
      `${[
        JSON.stringify({ v: 4, kind: 'header', id: conversationId, storageVersion: 1, createdAt: 1, cwd: workspace }),
        JSON.stringify({
          seq: 1,
          kind: 'entry',
          id: 'e1',
          parentId: null,
          timestamp: 1_700_000_000_001,
          type: 'message',
          message: { role: 'user', content: [{ type: 'text', text: 'fix the parser' }], timestamp: 1_700_000_000_001 },
        }),
      ].join('\n')}\n`,
      'utf-8',
    )

    ensureGateExtension(agentDirectory)
    const store = new ProviderStore(dataDirectory, new CredentialVault(dataDirectory, testCipher))
    store.save({
      id: 'scripted',
      name: 'Scripted',
      api: 'openai-completions',
      baseUrl: model.baseUrl,
      models: [
        { id: 'scripted', name: 'Scripted', contextWindow: 128_000, maxTokens: 4_096, reasoning: false, images: false },
      ],
    })
    store.setCredential('scripted', SECRET)
    writeModelsFile(store, agentDirectory)

    const rpc = AgentRpc.open({
      file: LIVE_PI,
      args: [
        ...rpcArgs({ sessionsDirectory: previous, sessionId: conversationId, name: 'legacy' }),
        '--provider',
        'scripted',
        '--model',
        'scripted',
      ],
      cwd: workspace,
      env: {
        ...rpcEnv(process.env, agentDirectory),
        [credentialVariable('scripted')]: SECRET,
        PATH: process.env.PATH ?? '',
      },
    })
    running.push(rpc)

    // Alpha imports the old file before it starts the agent; the agent then opens it by name.
    importLegacySessionIn(previous, conversationId)
    const state = await rpc.send({ type: 'get_state' })
    const entries = await rpc.send({ type: 'get_entries' })
    expect(state.ok, state.error ?? '').toBe(true)
    expect(JSON.stringify(entries.data)).toContain('fix the parser')
  }, 120_000)

  it('asks Alpha before a tool call, and the model reads Alpha’s refusal', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-live-'))
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-live-ws-'))
    const agentDirectory = join(dataDirectory, 'agent')
    const model = await fakeProvider()

    // Alpha's own directory: the gate it writes, and the models it knows — no secret in the file.
    ensureGateExtension(agentDirectory)
    const store = new ProviderStore(dataDirectory, new CredentialVault(dataDirectory, testCipher))
    store.save({
      id: 'scripted',
      name: 'Scripted',
      api: 'openai-completions',
      baseUrl: model.baseUrl,
      models: [
        { id: 'scripted', name: 'Scripted', contextWindow: 128_000, maxTokens: 4_096, reasoning: false, images: false },
      ],
    })
    store.setCredential('scripted', SECRET)
    writeModelsFile(store, agentDirectory)

    const rpc = AgentRpc.open({
      file: LIVE_PI,
      args: [
        ...rpcArgs({ sessionsDirectory: join(dataDirectory, 'sessions'), sessionId: 'live1', name: 'live' }),
        '--provider',
        'scripted',
        '--model',
        'scripted',
      ],
      cwd: workspace,
      env: {
        ...rpcEnv(process.env, agentDirectory),
        [credentialVariable('scripted')]: SECRET,
        PATH: process.env.PATH ?? '',
      },
    })
    running.push(rpc)

    const events: Array<{ type: string; [field: string]: unknown }> = []
    let asked = 0
    rpc.onEvent((event) => {
      events.push(event)
      if (event.type !== 'extension_ui_request') return
      asked += 1
      rpc.answer({ id: String(event.id), value: 'deny: Alpha does not run commands from here.' })
    })

    const prompt = await rpc.send({ type: 'prompt', message: 'run echo hello' })
    expect(prompt.ok, prompt.error ?? '').toBe(true)
    for (let attempt = 0; attempt < 400 && !events.some((one) => one.type === 'agent_settled'); attempt += 1) {
      await new Promise((done) => setTimeout(done, 50))
    }

    // The agent loaded Alpha's extension and put the call to Alpha before running anything.
    expect(asked).toBeGreaterThan(0)
    const ended = events.find((one) => one.type === 'tool_execution_end')
    expect(ended?.isError).toBe(true)
    expect(JSON.stringify(ended?.result)).toContain('Alpha does not run commands from here.')

    // And the model was told, in Alpha's words, rather than being left to try again.
    const sent = JSON.stringify(await model.captured())
    expect(sent).toContain('Alpha does not run commands from here.')
  }, 120_000)
})
