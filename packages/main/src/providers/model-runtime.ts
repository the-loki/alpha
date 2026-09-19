/**
 * Turns the configured providers into the `Models` collection the agent runtime talks to.
 *
 * Every provider is built from the record the user wrote: no host, no model id and no wire
 * behaviour comes from Alpha itself, and the record's protocol picks one of the three API
 * implementations (ADR-0015). The default model is the one chosen in settings, falling back to the
 * first model of the first provider that has any when nobody has chosen.
 */

import type { ConversationModel, ProviderApi, ProviderModelDefinition, StoredProvider, Undef } from '@alpha/core'
import {
  type Api,
  createModels,
  createProvider,
  type Model,
  type MutableModels,
  type Provider,
  type ProviderStreams,
} from '@earendil-works/pi-ai'
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
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

/** The three protocols Alpha speaks, in one table: the record's `api` picks the implementation. */
const API_FACTORY: Record<ProviderApi, () => ProviderStreams> = {
  'openai-completions': openAICompletionsApi,
  'anthropic-messages': anthropicMessagesApi,
  'google-generative-ai': googleGenerativeAIApi,
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
  return createProvider({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    auth: authFor(store, provider.id),
    models: provider.models.map((model) => toPiModel(provider, model)),
    api: API_FACTORY[provider.api](),
  })
}

/** The model the workbench falls back to when nobody has chosen one: the first that exists. */
function firstModel(providers: StoredProvider[]): Undef<ConversationModel> {
  for (const provider of providers) {
    const model = provider.models[0]
    if (model !== undefined) return { providerId: provider.id, modelId: model.id }
  }
  return undefined
}

export function createProviderModelRuntime(store: ProviderStore): ProviderModelRuntime {
  const models = createModels()
  const providers = store.list()
  for (const provider of providers) models.setProvider(buildProvider(store, provider))

  const chosen = store.defaultModel() ?? firstModel(providers)
  const model = chosen === undefined ? undefined : models.getModel(chosen.providerId, chosen.modelId)
  return model === undefined ? { models } : { models, defaultModel: model }
}
