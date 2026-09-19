/**
 * What the settings screen is allowed to do with providers, and the one action that talks to the
 * network: testing a connection, which reports the provider's own words back to the user.
 *
 * The service never returns a credential. It can say whether one is stored, and it can replace
 * or delete one (docs/constraints/02-architecture.md C2.4).
 *
 * Two panels, two jobs: a provider is a connection (protocol, base url, key), and a model is a name
 * that connection serves with the limits that go with it. Every change answers with the whole
 * snapshot, so the window keeps one state instead of making a call after each edit.
 */

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
import type { Api, Model } from '@earendil-works/pi-ai'
import { createProviderModelRuntime } from './model-runtime.ts'
import type { ProviderStore } from './store.ts'

export interface ProvidersSnapshot {
  providers: ProviderView[]
  /** 'plaintext' means the OS gave us no keychain and the UI must say so. */
  protection: 'os' | 'plaintext'
  /** What a new conversation starts on. Absent means the first model of the first provider. */
  defaultModel?: ConversationModel
}

export interface ProviderTestResult {
  ok: boolean
  /** Either the model's reply or the provider's error, never a generic failure. */
  message: string
}

export class ProviderService {
  readonly #store: ProviderStore

  constructor(store: ProviderStore) {
    this.#store = store
  }

  snapshot(): ProvidersSnapshot {
    return {
      providers: this.#store.views(),
      protection: this.#store.protection(),
      defaultModel: this.#store.defaultModel(),
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

  /** One real request, so a wrong key or a wrong base URL is caught here and not mid-conversation. */
  async test(providerId: string, modelId: string): Promise<ProviderTestResult> {
    const provider: Undef<StoredProvider> = this.#store.find(providerId)
    if (provider === undefined) return { ok: false, message: `No provider ${providerId}` }
    if (!this.#store.hasCredential(providerId)) {
      return { ok: false, message: credentialRequirement({ hasCredential: false }).reason }
    }

    const runtime = createProviderModelRuntime(this.#store)
    const model: Undef<Model<Api>> = runtime.models.getModel(providerId, modelId)
    if (model === undefined) return { ok: false, message: `${providerId} does not serve ${modelId}` }

    try {
      const reply = await runtime.models.completeSimple(
        model,
        { messages: [{ role: 'user', content: 'Reply with the single word: ready', timestamp: Date.now() }] },
        { maxTokens: 32 },
      )
      const text = reply.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join('')
        .trim()
      if (reply.stopReason === 'error') {
        return { ok: false, message: reply.errorMessage ?? 'The provider refused the request.' }
      }
      return { ok: true, message: text === '' ? 'The provider answered.' : text }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
}
