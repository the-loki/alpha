/**
 * What the settings screen is allowed to do with providers: store them, name their models, keep
 * their keys, say which one a new conversation runs on, and — when the person asks — find out
 * whether one answers. The last of those is asked *through the agent*, because the agent is what
 * talks to a provider: Alpha hands it the model to try and the key that goes with it, and reports
 * back what the agent made of it.
 *
 * The service never returns a credential. It can say whether one is stored, and it can replace
 * or delete one (docs/constraints/02-architecture.md C2.4).
 *
 * Two panels, two jobs: a provider is a connection (protocol, base url, key), and a model is a name
 * that connection serves with the limits that go with it. Every change answers with the whole
 * snapshot, so the window keeps one state instead of making a call after each edit.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ConversationModel,
  credentialRequirement,
  type ProviderModelDefinition,
  type ProviderView,
  readModels,
  readProvider,
  type StoredProvider,
  type Undef,
} from '@alpha/core'
import { AgentRpc, rpcArgs } from '../agent-cli/rpc.ts'
import { writeModelsFile } from '../runtime/agent-models.ts'
import { agentEnv } from '../runtime/agent-process.ts'
import type { AgentPorts } from '../runtime/session-files.ts'
import type { ProviderStore } from './store.ts'

export interface ProvidersSnapshot {
  providers: ProviderView[]
  /** 'plaintext' means the OS gave us no keychain and the UI must say so. */
  protection: 'os' | 'plaintext'
  /** What a new conversation starts on: the choice below, or the first model there is. */
  defaultModel?: ConversationModel
  /** The model the user chose for that, absent when they never chose one. */
  defaultModelChoice?: ConversationModel
}

export interface ProviderTestResult {
  ok: boolean
  /** Either what the model answered or why it could not be reached, never a generic failure. */
  message: string
}

export class ProviderService {
  readonly #store: ProviderStore
  readonly #agent: AgentPorts
  /** Where a test's own session and workspace live: never the person's workspace. */
  readonly #scratch: string

  constructor(store: ProviderStore, options: { agent: AgentPorts; scratch: string }) {
    this.#store = store
    this.#agent = options.agent
    this.#scratch = options.scratch
  }

  snapshot(): ProvidersSnapshot {
    return {
      providers: this.#store.views(),
      protection: this.#store.protection(),
      defaultModel: this.#store.effectiveModel(),
      defaultModelChoice: this.#store.chosenModel(),
    }
  }

  /** A new provider serves nothing yet: its models are added on the models panel. */
  save(input: unknown): ProvidersSnapshot {
    const result = readProvider(input)
    if (result.provider === undefined) throw new Error(result.error ?? 'the provider is not valid')
    const known = this.#store.find(result.provider.id)
    this.#store.save({ ...result.provider, models: known?.models ?? [] })
    return this.snapshot()
  }

  saveModels(id: string, input: unknown): ProvidersSnapshot {
    const result = readModels(input)
    if (result.models === undefined) throw new Error(result.error ?? 'the model list is not valid')
    this.#store.saveModels(id, result.models)
    return this.snapshot()
  }

  /** What new conversations start on. Absent hands the choice back to the first model found. */
  setDefaultModel(chosen: Undef<ConversationModel>): ProvidersSnapshot {
    if (chosen !== undefined) {
      const provider: Undef<StoredProvider> = this.#store.find(chosen.providerId)
      const serves = provider?.models.some((model: ProviderModelDefinition) => model.id === chosen.modelId)
      if (serves !== true) throw new Error(`${chosen.providerId} does not serve ${chosen.modelId}`)
    }
    this.#store.setDefaultModel(chosen)
    return this.snapshot()
  }

  remove(id: string): ProvidersSnapshot {
    this.#store.remove(id)
    return this.snapshot()
  }

  setCredential(id: string, secret: string): ProvidersSnapshot {
    if (this.#store.find(id) === undefined) throw new Error(`No provider ${id}`)
    this.#store.setCredential(id, secret)
    return this.snapshot()
  }

  /**
   * One real request, so a wrong key or a wrong base URL is caught here rather than mid-turn. It
   * is the agent that makes it — with this provider and this model, and with the key in its
   * environment — so what is tested is the path a conversation takes, not a second implementation
   * of it that could disagree.
   */
  async test(providerId: string, modelId: string): Promise<ProviderTestResult> {
    const provider = this.#store.find(providerId)
    if (provider === undefined) return { ok: false, message: `No provider ${providerId}` }
    if (!this.#store.hasCredential(providerId)) {
      return { ok: false, message: credentialRequirement({ hasCredential: false }).reason }
    }
    const credential = this.#agent.credential(providerId)
    if (credential.problem !== undefined) return { ok: false, message: credential.problem.message }
    if (this.#agent.path() === '') {
      return { ok: false, message: 'No agent is installed, so there is nothing here to ask the provider.' }
    }

    mkdirSync(this.#scratch, { recursive: true })
    writeModelsFile(this.#store, this.#agent.directory)
    const rpc = AgentRpc.open({
      file: this.#agent.path(),
      args: [
        ...rpcArgs({
          sessionsDirectory: join(this.#scratch, 'sessions'),
          sessionId: `test-${Date.now()}`,
          name: 'provider test',
        }),
        '--provider',
        providerId,
        '--model',
        modelId,
      ],
      cwd: this.#scratch,
      env: { ...agentEnv(this.#agent.env, this.#agent.directory), ...credential.env },
    })
    try {
      return await askOnce(rpc)
    } finally {
      await rpc.close()
    }
  }
}

/** One question, one answer: the shortest thing that proves a provider is reachable. */
async function askOnce(rpc: AgentRpc): Promise<ProviderTestResult> {
  const settled = new Promise<void>((done) => {
    const stop = rpc.onEvent((event) => {
      if (event.type !== 'agent_settled' && event.type !== 'agent_end') return
      stop()
      done()
    })
  })
  const asked = await rpc.send({ type: 'prompt', message: 'Reply with the single word: ready' })
  if (!asked.ok) return { ok: false, message: asked.error ?? 'The provider refused the request.' }
  await settled
  const said = await rpc.send({ type: 'get_last_assistant_text' })
  const data = said.data as Undef<{ text?: unknown }>
  const answer = data?.text
  const text = typeof answer === 'string' ? answer.trim() : ''
  return text === '' ? { ok: false, message: 'The provider answered with nothing.' } : { ok: true, message: text }
}
