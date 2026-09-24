/**
 * The model runtime Alpha dials with: one pi-ai provider per provider the person configured, and
 * the key answered from the vault at the moment a request needs it.
 *
 * This is the in-process successor of what used to leave Alpha as a `models.json` and a named
 * environment variable: the same stored definitions (base URL, wire protocol, model list), the
 * same rule that a secret is never written down and never handed further than the request that
 * dials with it (C2.4). A provider whose key cannot be read is simply unconfigured — the model
 * exists, `getAuth` answers nothing, and the stream says why when it is asked to run.
 */

import type { ProviderApi, StoredProvider, Undef } from '@alpha/domain'
import { createModels, createProvider, type Model, type Models, type ProviderStreams } from '@earendil-works/pi-ai'
import * as anthropicMessages from '@earendil-works/pi-ai/api/anthropic-messages'
import * as openaiCompletions from '@earendil-works/pi-ai/api/openai-completions'
import * as openaiResponses from '@earendil-works/pi-ai/api/openai-responses'

/** The wire protocol each stored provider speaks, matched by the name Alpha already stores. */
const WIRE: Record<ProviderApi, ProviderStreams> = {
  'openai-completions': openaiCompletions,
  'openai-responses': openaiResponses,
  'anthropic-messages': anthropicMessages,
}

/** One stored model, as pi-ai's stream functions expect it. Unpriced models stay at zero. */
function modelOf(provider: StoredProvider, definition: StoredProvider['models'][number]): Model<ProviderApi> {
  return {
    id: definition.id,
    name: definition.name,
    api: provider.api,
    provider: provider.id,
    baseUrl: provider.baseUrl,
    reasoning: definition.reasoning,
    input: definition.images === true ? ['text', 'image'] : ['text'],
    contextWindow: definition.contextWindow,
    maxTokens: definition.maxTokens,
    cost: definition.rates ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }
}

/**
 * Builds the runtime. `credential` is asked per request, so a key entered after the runtime was
 * built is used by the very next turn; it answers with the secret, or nothing when there is none.
 */
export function createModelRuntime(options: {
  providers: StoredProvider[]
  credential: (providerId: string) => Undef<string>
}): Models {
  const models = createModels()
  for (const provider of options.providers) {
    models.setProvider(
      createProvider({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        auth: {
          apiKey: {
            name: `${provider.name} API key`,
            resolve: async () => {
              const key = options.credential(provider.id)
              if (key === undefined) return undefined
              // The key travels the way the protocol expects it: the wire's own api-key header by
              // default, Authorization: Bearer where that is the only door (ADR-0015).
              const auth =
                provider.authStyle === 'bearer' ? { headers: { authorization: `Bearer ${key}` } } : { apiKey: key }
              return { auth, source: 'Alpha vault' }
            },
          },
        },
        models: provider.models.map((definition) => modelOf(provider, definition)),
        api: WIRE[provider.api],
      }),
    )
  }
  return models
}
