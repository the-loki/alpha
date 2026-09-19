/**
 * What the settings screen is allowed to do with providers, and the one action that talks to the
 * network: testing a connection, which reports the provider's own words back to the user.
 *
 * The service never returns a credential. It can say whether one is stored, and it can replace
 * or delete one (docs/constraints/02-architecture.md C2.4).
 */

import {
  credentialRequirement,
  customProvider,
  findCatalogEntry,
  PROVIDER_CATALOG,
  type ProviderModelDefinition,
  type ProviderView,
  providerFromCatalog,
  type StoredProvider,
  type Undef,
} from '@alpha/core'
import type { Api, Model } from '@earendil-works/pi-ai'
import { createProviderModelRuntime, modelsFor } from './model-runtime.ts'
import type { ProviderStore } from './store.ts'

export interface ProvidersSnapshot {
  providers: ProviderView[]
  /** 'plaintext' means the OS gave us no keychain and the UI must say so. */
  protection: 'os' | 'plaintext'
  catalog: { id: string; name: string; api: string; baseUrl: string; keyHint: string }[]
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
      catalog: catalogForUi(),
    }
  }

  saveFromCatalog(id: string, models: ProviderModelDefinition[]): StoredProvider {
    const entry = findCatalogEntry(id)
    if (entry === undefined) throw new Error(`No catalog entry ${id}`)
    const provider = providerFromCatalog(entry, models)
    this.#store.save(provider)
    return provider
  }

  saveCustom(input: unknown): StoredProvider {
    const result = customProvider(input)
    if (result.provider === undefined) throw new Error(result.error ?? 'the provider is not valid')
    this.#store.save(result.provider)
    return result.provider
  }

  remove(id: string): void {
    this.#store.remove(id)
  }

  setCredential(id: string, secret: string): ProvidersSnapshot {
    if (this.#store.find(id) === undefined) throw new Error(`No provider ${id}`)
    this.#store.setCredential(id, secret)
    return this.snapshot()
  }

  models(providerId: string): ProviderModelDefinition[] {
    const provider = this.#store.find(providerId)
    if (provider === undefined) throw new Error(`No provider ${providerId}`)
    return modelsFor(provider)
  }

  /** One real request, so a wrong key or a wrong base URL is caught here and not mid-conversation. */
  async test(providerId: string, modelId: string): Promise<ProviderTestResult> {
    const provider = this.#store.find(providerId)
    if (provider === undefined) return { ok: false, message: `No provider ${providerId}` }
    if (!this.#store.hasCredential(providerId))
      return { ok: false, message: credentialRequirement({ hasCredential: false }).reason }

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

/** The catalog as the UI needs it: everything except the model list, which comes from the provider. */
function catalogForUi(): ProvidersSnapshot['catalog'] {
  return PROVIDER_CATALOG.map((entry) => ({
    id: entry.id,
    name: entry.name,
    api: entry.api,
    baseUrl: entry.baseUrl,
    keyHint: entry.keyHint,
  }))
}
