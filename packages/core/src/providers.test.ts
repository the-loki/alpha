import { describe, expect, it } from 'vitest'
import {
  credentialRequirement,
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
  id: 'my-endpoint',
  name: 'My endpoint',
  api: 'openai-completions',
  baseUrl: 'https://llm.internal.example/v1',
}

const stored = {
  version: 1 as const,
  providers: [
    {
      id: 'my-endpoint',
      name: 'My endpoint',
      api: 'openai-completions' as const,
      baseUrl: input.baseUrl,
      models: [model],
    },
  ],
}

describe('[core] the wire protocols', () => {
  it('ships the three a person is likely to have: chat completions, responses, messages', () => {
    expect([...PROVIDER_APIS]).toEqual(['openai-completions', 'openai-responses', 'anthropic-messages'])
    expect(isProviderApi('openai-responses')).toBe(true)
    expect(isProviderApi('google-generative-ai')).toBe(false)
    expect(isProviderApi('carrier-pigeon')).toBe(false)
  })
})

describe('[core] readProvider', () => {
  it('accepts a well-formed connection', () => {
    expect(readProvider(input).provider).toEqual({ ...input })
  })

  it('names the connection after itself when it was given no name', () => {
    expect(readProvider({ ...input, name: '' }).provider?.name).toBe('my-endpoint')
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

  it('says nothing about models: a connection is not a model list', () => {
    expect(readProvider({ ...input, models: 'whatever' }).provider).toBeDefined()
    expect(Object.keys(readProvider(input).provider ?? {})).toEqual(['id', 'name', 'api', 'baseUrl'])
  })
})

describe('[core] readModels', () => {
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

describe('[core] credentialRequirement', () => {
  it('asks for a key when the provider has none stored', () => {
    expect(credentialRequirement({ hasCredential: false }).kind).toBe('missing')
  })

  it('reports readiness when a key is stored', () => {
    expect(credentialRequirement({ hasCredential: true }).kind).toBe('present')
  })
})

describe('[core] parseProviders', () => {
  it('round-trips a stored provider and the default model', () => {
    const index = { ...stored, defaultModel: { providerId: 'my-endpoint', modelId: 'local-7b' } }
    expect(parseProviders(JSON.parse(JSON.stringify(index)))).toEqual(index)
  })

  it('reads a model written before the picture setting as one that takes text only', () => {
    // The file as it was written by a version that had no such setting: same shape, one key less.
    const legacy = {
      version: 1,
      providers: [
        {
          id: 'my-endpoint',
          name: 'My endpoint',
          api: 'openai-completions',
          baseUrl: 'https://llm.internal.example/v1',
          models: [{ id: 'local-7b', name: 'Local 7B', contextWindow: 32_000, maxTokens: 4_096, reasoning: false }],
        },
      ],
    }
    expect(parseProviders(legacy).providers[0]?.models[0]?.images).toBe(false)
  })

  it('treats a file it cannot trust as empty', () => {
    expect(parseProviders('{oops')).toEqual(emptyProviderIndex())
    expect(parseProviders({ version: 1, providers: [{ id: 'x' }] })).toEqual(emptyProviderIndex())
    expect(parseProviders({ ...stored, defaultModel: { providerId: 'my-endpoint' } })).toEqual(emptyProviderIndex())
  })
})

describe('[core] which model a new conversation starts on', () => {
  const twoProviders = {
    version: 1 as const,
    providers: [
      { id: 'empty', name: 'Empty', api: 'openai-completions' as const, baseUrl: 'https://a.test', models: [] },
      ...stored.providers,
    ],
  }

  it('is the first model of the first provider that has one', () => {
    expect(firstModelOf(twoProviders)).toEqual({ providerId: 'my-endpoint', modelId: 'local-7b' })
    expect(firstModelOf({ providers: [] })).toBeUndefined()
  })

  it('is the chosen one when there is a choice', () => {
    const chosen = { ...twoProviders, defaultModel: { providerId: 'my-endpoint', modelId: 'local-7b' } }
    expect(effectiveModelOf(chosen)).toEqual({ providerId: 'my-endpoint', modelId: 'local-7b' })
  })

  it('falls back to the first model there is when nothing was chosen, or the choice is gone', () => {
    expect(effectiveModelOf(twoProviders)).toEqual({ providerId: 'my-endpoint', modelId: 'local-7b' })
    const stale = { ...twoProviders, defaultModel: { providerId: 'my-endpoint', modelId: 'deleted' } }
    expect(effectiveModelOf(stale)).toEqual({ providerId: 'my-endpoint', modelId: 'local-7b' })
  })

  it('is nothing at all when no provider serves anything', () => {
    expect(effectiveModelOf({ providers: [] })).toBeUndefined()
  })
})

describe('[core] modelIn', () => {
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
    expect(modelIn(served, { providerId: 'my-endpoint', modelId: 'local-70b' })).toEqual({
      providerId: 'my-endpoint',
      modelId: 'local-70b',
    })
  })

  it('falls back to the effective default when the choice is gone', () => {
    expect(modelIn(served, { providerId: 'my-endpoint', modelId: 'deleted' })).toEqual({
      providerId: 'my-endpoint',
      modelId: 'local-7b',
    })
    expect(modelIn(served, { providerId: 'gone', modelId: 'local-7b' })).toEqual({
      providerId: 'my-endpoint',
      modelId: 'local-7b',
    })
  })

  it('answers with nothing when a conversation has no model and no provider serves anything', () => {
    expect(modelIn({ providers: [] }, { providerId: 'gone', modelId: 'local-7b' })).toBeUndefined()
  })
})

describe('[core] defaultModelOf', () => {
  it('answers with the stored default when a provider still serves it', () => {
    const index = { ...stored, defaultModel: { providerId: 'my-endpoint', modelId: 'local-7b' } }
    expect(defaultModelOf(index)).toEqual({ providerId: 'my-endpoint', modelId: 'local-7b' })
  })

  it('answers with nothing when it was never chosen, or the model is gone', () => {
    expect(defaultModelOf(stored)).toBeUndefined()
    expect(
      defaultModelOf({ ...stored, defaultModel: { providerId: 'my-endpoint', modelId: 'deleted' } }),
    ).toBeUndefined()
    expect(defaultModelOf({ ...stored, defaultModel: { providerId: 'gone', modelId: 'local-7b' } })).toBeUndefined()
  })
})
