import { describe, expect, it } from 'vitest'
import {
  defaultModelOf,
  effectiveModelOf,
  emptyProviderIndex,
  firstModelOf,
  isProviderApi,
  modelIn,
  PROVIDER_APIS,
  parseProviders,
  readModels,
  readProvider,
  servesModel,
} from './providers.ts'

const model = {
  id: 'local-7b',
  name: 'Local 7B',
  contextWindow: 32_000,
  maxTokens: 4_096,
  reasoning: false,
  images: false,
}

const input = {
  id: 'local-llama',
  name: 'Local Llama',
  api: 'openai-completions',
  baseUrl: 'https://llm.internal.example/v1',
}

const stored = {
  version: 1 as const,
  providers: [
    {
      id: 'local-llama',
      name: 'Local Llama',
      api: 'openai-completions' as const,
      baseUrl: input.baseUrl,
      models: [model],
    },
  ],
}

describe('[domain] the wire protocols', () => {
  it('ships the three a person is likely to have: chat completions, responses, messages', () => {
    expect([...PROVIDER_APIS]).toEqual(['openai-completions', 'openai-responses', 'anthropic-messages'])
    expect(isProviderApi('openai-responses')).toBe(true)
    expect(isProviderApi('google-generative-ai')).toBe(false)
    expect(isProviderApi('carrier-pigeon')).toBe(false)
  })
})

describe('[domain] readProvider', () => {
  it('accepts a well-formed connection', () => {
    expect(readProvider(input).provider).toEqual({ ...input })
  })

  it('names the connection after itself when it was given no name', () => {
    expect(readProvider({ ...input, name: '' }).provider?.name).toBe('local-llama')
  })

  it('refuses an id that is empty or has spaces', () => {
    expect(readProvider({ ...input, id: '' }).error).toContain('id')
    expect(readProvider({ ...input, id: 'my endpoint' }).error).toContain('id')
  })

  it('refuses a base url that is not http(s)', () => {
    expect(readProvider({ ...input, baseUrl: 'ftp://example.com' }).error).toContain('url')
  })

  it('refuses a protocol Alpha cannot speak', () => {
    expect(readProvider({ ...input, api: 'carrier-pigeon' }).error).toContain('protocol')
  })

  it('reads an auth style and refuses one it does not know', () => {
    expect(readProvider({ ...input, authStyle: 'bearer' }).provider?.authStyle).toBe('bearer')
    expect(readProvider({ ...input, authStyle: 'pigeon' }).error).toContain('auth')
  })

  it('says nothing about models: a connection is not a model list', () => {
    expect(readProvider({ ...input, models: 'whatever' }).provider).toBeDefined()
    expect(Object.keys(readProvider(input).provider ?? {})).toEqual(['id', 'name', 'api', 'baseUrl'])
  })
})

describe('[domain] readModels', () => {
  it('keeps configured rates and rejects invalid prices', () => {
    const rates = { input: 1.5, output: 6, cacheRead: 0.15, cacheWrite: 1.875 }
    expect(readModels([{ ...model, rates }]).models?.[0]?.rates).toEqual(rates)
    expect(readModels([{ ...model, rates: { ...rates, output: -1 } }]).error).toContain('price')
    expect(readModels([{ ...model, rates: { ...rates, output: Number.NaN } }]).error).toContain('price')
  })

  it('reads a list and fills in what was left out', () => {
    expect(readModels([{ id: 'local-7b', contextWindow: 128_000 }]).models).toEqual([
      { id: 'local-7b', name: 'local-7b', contextWindow: 128_000, maxTokens: 4096, reasoning: false, images: false },
    ])
    expect(readModels([model]).models).toEqual([model])
  })

  it('reads a model that takes pictures as one that does, and everything else as one that does not', () => {
    expect(readModels([{ id: 'vision', contextWindow: 128_000, images: true }]).models?.[0]?.images).toBe(true)
    expect(readModels([{ id: 'text-only', contextWindow: 128_000 }]).models?.[0]?.images).toBe(false)
    // A file from before this setting existed is read as text only rather than refused.
    expect(readModels([{ id: 'old', contextWindow: 128_000, images: 'yes' }]).models?.[0]?.images).toBe(false)
  })

  it('refuses a model with no id, and one with no room in it', () => {
    expect(readModels([{ ...model, id: '  ' }]).error).toContain('id')
    expect(readModels([{ id: 'm', contextWindow: 0 }]).error).toContain('context')
    expect(readModels([{ id: 'm' }]).error).toContain('context')
  })

  it('refuses something that is not a list at all', () => {
    expect(readModels('local-7b').error).toContain('list')
  })

  it('takes an empty list: a provider that serves nothing yet is a state, not a mistake', () => {
    expect(readModels([]).models).toEqual([])
  })
})

describe('[domain] parseProviders', () => {
  it('preserves configured rates while older models remain without rates', () => {
    const rates = { input: 1.5, output: 6, cacheRead: 0.15, cacheWrite: 1.875 }
    const priced = { ...stored, providers: [{ ...stored.providers[0], models: [{ ...model, rates }] }] }
    expect(parseProviders(priced).providers[0]?.models[0]?.rates).toEqual(rates)
    expect(parseProviders(stored).providers[0]?.models[0]?.rates).toBeUndefined()
  })

  it('keeps a stored provider when an optional rate is malformed', () => {
    const invalid = { ...stored, providers: [{ ...stored.providers[0], models: [{ ...model, rates: { input: -1 } }] }] }
    expect(parseProviders(invalid)).toEqual(stored)
  })

  it('round-trips a stored provider and the default model', () => {
    const index = { ...stored, defaultModel: { providerId: 'local-llama', modelId: 'local-7b' } }
    expect(parseProviders(JSON.parse(JSON.stringify(index)))).toEqual(index)
  })

  it('reads a model written before the picture setting as one that takes text only', () => {
    // The file as it was written by a version that had no such setting: same shape, one key less.
    const legacy = {
      version: 1,
      providers: [
        {
          id: 'local-llama',
          name: 'Local Llama',
          api: 'openai-completions',
          baseUrl: 'https://llm.internal.example/v1',
          models: [{ id: 'local-7b', name: 'Local 7B', contextWindow: 32_000, maxTokens: 4_096, reasoning: false }],
        },
      ],
    }
    expect(parseProviders(legacy).providers[0]?.models[0]?.images).toBe(false)
  })

  it('keeps the auth style a provider was stored with, and says nothing when there was none', () => {
    const bearer = parseProviders({ version: 1, providers: [{ ...stored.providers[0], authStyle: 'bearer' }] })
    expect(bearer.providers[0]?.authStyle).toBe('bearer')
    const plain = parseProviders({ version: 1, providers: [stored.providers[0]] })
    expect(plain.providers[0]?.authStyle).toBeUndefined()
  })

  it('treats a file it cannot trust as empty', () => {
    expect(parseProviders('{oops')).toEqual(emptyProviderIndex())
    expect(parseProviders({ version: 1, providers: [{ id: 'x' }] })).toEqual(emptyProviderIndex())
    expect(parseProviders({ ...stored, defaultModel: { providerId: 'local-llama' } })).toEqual(emptyProviderIndex())
  })
})

describe('[domain] which model a new conversation starts on', () => {
  const twoProviders = {
    version: 1 as const,
    providers: [
      { id: 'empty', name: 'Empty', api: 'openai-completions' as const, baseUrl: 'https://a.test', models: [] },
      ...stored.providers,
    ],
  }

  it('is the first model of the first provider that has one', () => {
    expect(firstModelOf(twoProviders)).toEqual({ providerId: 'local-llama', modelId: 'local-7b' })
    expect(firstModelOf({ providers: [] })).toBeUndefined()
  })

  it('is the chosen one when there is a choice', () => {
    const chosen = { ...twoProviders, defaultModel: { providerId: 'local-llama', modelId: 'local-7b' } }
    expect(effectiveModelOf(chosen)).toEqual({ providerId: 'local-llama', modelId: 'local-7b' })
  })

  it('falls back to the first model there is when nothing was chosen, or the choice is gone', () => {
    expect(effectiveModelOf(twoProviders)).toEqual({ providerId: 'local-llama', modelId: 'local-7b' })
    const stale = { ...twoProviders, defaultModel: { providerId: 'local-llama', modelId: 'deleted' } }
    expect(effectiveModelOf(stale)).toEqual({ providerId: 'local-llama', modelId: 'local-7b' })
  })

  it('is nothing at all when no provider serves anything', () => {
    expect(effectiveModelOf({ providers: [] })).toBeUndefined()
  })
})

describe('[domain] modelIn', () => {
  // Two models on the one connection, so "kept its own" cannot be confused with "took the first".
  const served = {
    ...stored,
    providers: [
      {
        ...stored.providers[0],
        models: [...stored.providers[0].models, { ...model, id: 'local-70b', name: 'Local 70B' }],
      },
    ],
  }

  it('keeps a conversation on its own model while a provider still serves it', () => {
    expect(modelIn(served, { providerId: 'local-llama', modelId: 'local-70b' })).toEqual({
      providerId: 'local-llama',
      modelId: 'local-70b',
    })
  })

  it('does not substitute another model when a conversation’s choice is gone', () => {
    expect(modelIn(served, { providerId: 'local-llama', modelId: 'deleted' })).toBeUndefined()
    expect(modelIn(served, { providerId: 'gone', modelId: 'local-7b' })).toBeUndefined()
    expect(modelIn(served, undefined)).toBeUndefined()
  })

  it('answers with nothing when a conversation has no model and no provider serves anything', () => {
    expect(modelIn({ providers: [] }, { providerId: 'gone', modelId: 'local-7b' })).toBeUndefined()
  })
})

describe('[domain] defaultModelOf', () => {
  it('answers with the stored default when a provider still serves it', () => {
    const index = { ...stored, defaultModel: { providerId: 'local-llama', modelId: 'local-7b' } }
    expect(defaultModelOf(index)).toEqual({ providerId: 'local-llama', modelId: 'local-7b' })
  })

  it('answers with nothing when it was never chosen, or the model is gone', () => {
    expect(defaultModelOf(stored)).toBeUndefined()
    expect(
      defaultModelOf({ ...stored, defaultModel: { providerId: 'local-llama', modelId: 'deleted' } }),
    ).toBeUndefined()
    expect(defaultModelOf({ ...stored, defaultModel: { providerId: 'gone', modelId: 'local-7b' } })).toBeUndefined()
  })
})

describe('[domain] servesModel', () => {
  it('says yes only when a provider on the index serves the exact model', () => {
    const index = { ...stored, defaultModel: undefined }
    expect(servesModel(index, { providerId: 'local-llama', modelId: 'local-7b' })).toBe(true)
    expect(servesModel(index, { providerId: 'local-llama', modelId: 'local-70b' })).toBe(false)
    expect(servesModel(index, { providerId: 'gone', modelId: 'local-7b' })).toBe(false)
  })
})
