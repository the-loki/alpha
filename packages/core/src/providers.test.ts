import { describe, expect, it } from 'vitest'
import { catalogEntry, PROVIDER_CATALOG } from './providers/templates.ts'
import {
  credentialRequirement,
  customProvider,
  emptyProviderIndex,
  findCatalogEntry,
  isProviderApi,
  parseProviders,
  providerFromCatalog,
  providerLabel,
} from './providers.ts'

describe('the catalog', () => {
  it('offers the providers a developer is most likely to already have a key for', () => {
    expect(PROVIDER_CATALOG.map((entry) => entry.id)).toEqual([
      'anthropic',
      'openai',
      'deepseek',
      'openrouter',
      'groq',
      'mistral',
      'xai',
    ])
  })

  it('gives every entry an https base url, a wire protocol, and a hint about its key', () => {
    for (const entry of PROVIDER_CATALOG) {
      expect(entry.baseUrl.startsWith('https://')).toBe(true)
      expect(isProviderApi(entry.api)).toBe(true)
      expect(entry.keyHint).not.toBe('')
    }
  })

  it('finds an entry by id, and reports nothing for an unknown one', () => {
    expect(findCatalogEntry('anthropic')?.name).toBe('Anthropic')
    expect(findCatalogEntry('nope')).toBeUndefined()
  })
})

describe('providerFromCatalog', () => {
  const models = [{ id: 'some-model', name: 'Some model', contextWindow: 128_000, maxTokens: 8_192, reasoning: false }]

  it('copies the catalog connection facts and the models it was given', () => {
    const entry = catalogEntry('deepseek')
    const provider = providerFromCatalog(entry, models)
    expect(provider).toMatchObject({
      id: 'deepseek',
      name: entry.name,
      api: entry.api,
      baseUrl: entry.baseUrl,
      source: 'catalog',
      catalogId: 'deepseek',
    })
    expect(provider.models).toEqual(models)
  })

  it('keeps the model list empty when none were supplied, rather than inventing ids', () => {
    expect(providerFromCatalog(catalogEntry('groq'), []).models).toEqual([])
  })
})

describe('customProvider', () => {
  const input = {
    id: 'my-endpoint',
    name: 'My endpoint',
    api: 'openai-completions',
    baseUrl: 'https://llm.internal.example/v1',
    models: [{ id: 'local-7b', name: 'Local 7B', contextWindow: 32_000, maxTokens: 4_096, reasoning: false }],
  }

  it('accepts a well-formed custom provider', () => {
    expect(customProvider(input).provider).toMatchObject({ id: 'my-endpoint', source: 'custom' })
  })

  it('refuses an id that is empty or has spaces', () => {
    expect(customProvider({ ...input, id: '' }).error).toContain('id')
    expect(customProvider({ ...input, id: 'my endpoint' }).error).toContain('id')
  })

  it('refuses a base url that is not http(s)', () => {
    expect(customProvider({ ...input, baseUrl: 'ftp://example.com' }).error).toContain('url')
  })

  it('refuses an unknown wire protocol', () => {
    expect(customProvider({ ...input, api: 'carrier-pigeon' }).error).toContain('protocol')
  })

  it('refuses a provider with no models', () => {
    expect(customProvider({ ...input, models: [] }).error).toContain('model')
  })

  it('refuses a model without a positive context window', () => {
    const models = [{ ...input.models[0], contextWindow: 0 }]
    expect(customProvider({ ...input, models }).error).toContain('context')
  })

  it('returns the provider under the key the caller reads', () => {
    const result = customProvider(input)
    expect(result.provider?.name).toBe('My endpoint')
    expect(result.error).toBeUndefined()
  })
})

describe('credentialRequirement', () => {
  it('asks for a key when the provider has none stored', () => {
    expect(credentialRequirement({ hasCredential: false }).kind).toBe('missing')
  })

  it('reports readiness when a key is stored', () => {
    expect(credentialRequirement({ hasCredential: true }).kind).toBe('present')
  })
})

describe('providerLabel', () => {
  const model = { id: 'm', name: 'M', contextWindow: 1000, maxTokens: 100, reasoning: false }

  it('names the provider and its model count for the settings list', () => {
    expect(providerLabel(providerFromCatalog(catalogEntry('groq'), [model]))).toBe('Groq · 1 model')
  })

  it('pluralises when there is more than one model', () => {
    expect(providerLabel(providerFromCatalog(catalogEntry('groq'), [model, model]))).toBe('Groq · 2 models')
  })
})

describe('parseProviders', () => {
  const stored = {
    id: 'openai',
    name: 'OpenAI',
    api: 'openai-completions' as const,
    baseUrl: 'https://api.openai.com/v1',
    source: 'catalog' as const,
    catalogId: 'openai',
    models: [{ id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128_000, maxTokens: 16_384, reasoning: false }],
  }

  it('round-trips a stored provider', () => {
    const index = { version: 1 as const, providers: [stored] }
    expect(parseProviders(JSON.parse(JSON.stringify(index)))).toEqual(index)
  })

  it('treats a file it cannot trust as empty', () => {
    expect(parseProviders('{oops')).toEqual(emptyProviderIndex())
    expect(parseProviders({ version: 1, providers: [{ id: 'x' }] })).toEqual(emptyProviderIndex())
  })
})
