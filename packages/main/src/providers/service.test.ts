import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderModelDefinition } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { CredentialVault } from './credential-vault.ts'
import { ProviderService } from './service.ts'
import { ProviderStore } from './store.ts'

/** A stand-in for the OS keychain, so what is stored is readable in a test. */
const cipher = {
  available: true,
  encrypt: (plaintext: string) => `sealed:${plaintext}`,
  decrypt: (payload: string) => payload.replace('sealed:', ''),
}

const service = () => {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-providers-'))
  const store = new ProviderStore(directory, new CredentialVault(directory, cipher))
  return { service: new ProviderService(store), store }
}

const endpoint = { id: 'local', name: 'Local', api: 'openai-completions' as const, baseUrl: 'https://llm.test/v1' }

const model = (id: string): ProviderModelDefinition => ({
  id,
  name: id,
  contextWindow: 128_000,
  maxTokens: 8_192,
  reasoning: false,
})

describe('[main] adding a connection', () => {
  it('starts with no models: a connection is not a model list', () => {
    const { service: providers } = service()
    expect(providers.save(endpoint).providers[0].models).toEqual([])
  })

  it('refuses a connection the boundary can make no sense of', () => {
    const { service: providers } = service()
    expect(() => providers.save({ ...endpoint, baseUrl: 'nonsense' })).toThrow(/url/)
  })

  it('keeps the models when the connection is edited', () => {
    const { service: providers } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('local-7b')])
    providers.save({ ...endpoint, name: 'Renamed' })
    expect(providers.snapshot().providers[0]).toMatchObject({ name: 'Renamed' })
    expect(providers.snapshot().providers[0].models.map((entry) => entry.id)).toEqual(['local-7b'])
  })
})

describe('[main] the models panel', () => {
  it('writes a model list, and refuses one it cannot read', () => {
    const { service: providers } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('a'), model('b')])
    expect(providers.snapshot().providers[0].models.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(() => providers.saveModels('local', [{ id: 'a', contextWindow: 0 }])).toThrow(/context/)
  })

  it('starts a new conversation on the first model there is, before anything is chosen', () => {
    const { service: providers } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('a'), model('b')])
    expect(providers.snapshot()).toMatchObject({
      defaultModel: { providerId: 'local', modelId: 'a' },
      defaultModelChoice: undefined,
    })
  })

  it('leaves the choice alone when the model it points at survives the edit', () => {
    const { service: providers } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('a'), model('b')])
    providers.setDefaultModel({ providerId: 'local', modelId: 'b' })
    providers.saveModels('local', [model('b')])
    expect(providers.snapshot()).toMatchObject({
      defaultModel: { providerId: 'local', modelId: 'b' },
      defaultModelChoice: { providerId: 'local', modelId: 'b' },
    })
  })

  it('forgets the choice when that model is removed, and falls back to what is left', () => {
    const { service: providers } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('a')])
    providers.setDefaultModel({ providerId: 'local', modelId: 'a' })
    providers.saveModels('local', [model('b')])
    expect(providers.snapshot()).toMatchObject({
      defaultModel: { providerId: 'local', modelId: 'b' },
      defaultModelChoice: undefined,
    })
  })

  it('refuses a default pointing at a model nobody serves', () => {
    const { service: providers } = service()
    providers.save(endpoint)
    expect(() => providers.setDefaultModel({ providerId: 'local', modelId: 'ghost' })).toThrow(/does not serve/)
  })

  it('has no model at all once the provider it pointed at is deleted', () => {
    const { service: providers } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('a')])
    providers.setDefaultModel({ providerId: 'local', modelId: 'a' })
    providers.remove('local')
    expect(providers.snapshot()).toMatchObject({
      providers: [],
      defaultModel: undefined,
      defaultModelChoice: undefined,
    })
  })
})

describe('[main] credentials', () => {
  it('deletes the key with the provider it belonged to', () => {
    const { service: providers, store } = service()
    providers.save(endpoint)
    providers.setCredential('local', 'sk-test')
    expect(providers.snapshot().providers[0].hasCredential).toBe(true)
    providers.remove('local')
    expect(store.hasCredential('local')).toBe(false)
  })
})
