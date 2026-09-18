/**
 * Turns the configured providers into the `Models` collection the agent runtime talks to.
 *
 * A catalog provider is pi-ai's own built-in definition with Alpha's credential bolted on: those
 * definitions carry the current model list and the right wire behaviour, and copying them would
 * mean maintaining a second, staler catalog. A custom provider is built from the user's own
 * definition, which is the only case where Alpha owns the model list.
 */

import type { ProviderModelDefinition, StoredProvider } from '@alpha/core'
import {
  type Api,
  createModels,
  createProvider,
  type Model,
  type MutableModels,
  type Provider,
} from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { builtinProviders } from '@earendil-works/pi-ai/providers/all'
import type { ProviderStore } from './store.ts'

export interface ProviderModelRuntime {
  models: MutableModels
  /** The model a new conversation starts on, or undefined when nothing is configured. */
  defaultModel?: Model<Api>
}

const authFor = (store: ProviderStore, providerId: string) => ({
  apiKey: {
    name: `${providerId} API key`,
    resolve: async () => {
      const key = store.credential(providerId)
      return key === undefined ? undefined : { auth: { apiKey: key }, source: 'Alpha credential store' }
    },
  },
})

/** The models a provider can serve: the built-in catalog's, or the user's own list. */
export function modelsFor(provider: StoredProvider): ProviderModelDefinition[] {
  if (provider.source === 'custom') return provider.models
  const builtin = builtinProviders().find((candidate) => candidate.id === provider.catalogId)
  if (builtin === undefined) return provider.models
  return builtin.getModels().map((model) => ({
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    reasoning: model.reasoning,
  }))
}

function toPiModel(provider: StoredProvider, model: ProviderModelDefinition): Model<Api> {
  return {
    id: model.id,
    name: model.name,
    api: provider.api,
    provider: provider.id,
    baseUrl: provider.baseUrl,
    reasoning: model.reasoning,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  }
}

function buildProvider(store: ProviderStore, provider: StoredProvider): Provider<Api> {
  const auth = authFor(store, provider.id)

  if (provider.source === 'catalog') {
    const builtin = builtinProviders().find((candidate) => candidate.id === provider.catalogId)
    if (builtin !== undefined) return { ...builtin, auth } as Provider<Api>
  }

  return createProvider({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    auth,
    models: provider.models.map((model) => toPiModel(provider, model)),
    api: provider.api === 'anthropic-messages' ? anthropicMessagesApi() : openAICompletionsApi(),
  })
}

export function createProviderModelRuntime(store: ProviderStore): ProviderModelRuntime {
  const models = createModels()
  const providers = store.list()
  for (const provider of providers) models.setProvider(buildProvider(store, provider))

  const first = providers[0]
  const firstModel = first === undefined ? undefined : modelsFor(first)[0]
  const defaultModel =
    first === undefined || firstModel === undefined ? undefined : models.getModel(first.id, firstModel.id)
  return defaultModel === undefined ? { models } : { models, defaultModel }
}

export function resolveModel(store: ProviderStore, providerId: string, modelId: string): Model<Api> | undefined {
  const providers = store.list()
  if (!providers.some((provider) => provider.id === providerId)) return undefined
  return createProviderModelRuntime(store).models.getModel(providerId, modelId)
}
