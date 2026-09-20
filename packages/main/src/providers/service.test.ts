import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderModelDefinition } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { credentialFor } from '../runtime/agent-models.ts'
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
  const agent = {
    path: (): string => join(import.meta.dirname, '../../../../tools/scripted-agent/pi.mjs'),
    directory: join(directory, 'agent'),
    env: { ALPHA_FAUX_REPLIES: JSON.stringify(['ready']) },
    sessionsRoot: join(directory, 'sessions'),
    credential: (providerId: string) => credentialFor(store, providerId),
  }
  return { service: new ProviderService(store, { agent, scratch: join(directory, 'scratch') }), store, agent }
}

const endpoint = { id: 'local', name: 'Local', api: 'openai-completions' as const, baseUrl: 'https://llm.test/v1' }

const model = (id: string): ProviderModelDefinition => ({
  id,
  name: id,
  contextWindow: 128_000,
  maxTokens: 8_192,
  reasoning: false,
  images: true,
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

/**
 * Whether a provider answers is asked through the agent, because the agent is what talks to one:
 * Alpha hands it the model and the key, and reports back what it made of it.
 */
describe('[agent-runtime] asking a provider whether it answers', () => {
  it('answers with the model’s own words, from a real run', async () => {
    const { service: providers } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('a')])
    providers.setCredential('local', 'sk-test')

    expect(await providers.test('local', 'a')).toEqual({ ok: true, message: 'ready' })
  })

  it('refuses a provider with no key, without asking the agent', async () => {
    const { service: providers } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('a')])

    expect(await providers.test('local', 'a')).toMatchObject({ ok: false })
    expect((await providers.test('local', 'a')).message).toContain('key')
  })

  it('refuses a provider that is not there', async () => {
    const { service: providers } = service()

    expect(await providers.test('nobody', 'a')).toMatchObject({ ok: false, message: 'No provider nobody' })
  })

  it('refuses when there is no agent to ask', async () => {
    const { service: providers, agent } = service()
    providers.save(endpoint)
    providers.saveModels('local', [model('a')])
    providers.setCredential('local', 'sk-test')

    agent.path = () => ''
    expect((await providers.test('local', 'a')).message).toContain('No agent is installed')
  })
})
