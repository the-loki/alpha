import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderApi, ProviderAuthStyle, ProviderModelDefinition } from '@alpha/domain'
import { CredentialVault, ProviderStore } from '@alpha/providers'
import type { Models } from '@earendil-works/pi-ai'
import { afterEach, describe, expect, it } from 'vitest'
import { aModel, scriptedModels, textStream } from '../runtime/scripted-provider.ts'
import { closeScriptedWires, startScriptedWire } from './scripted-wire.ts'
import { ProviderService } from './service.ts'

/** A stand-in for the OS keychain, so what is stored is readable in a test. */
const cipher = {
  available: true,
  encrypt: (plaintext: string) => `sealed:${plaintext}`,
  decrypt: (payload: string) => payload.replace('sealed:', ''),
}

const service = (models?: () => Models) => {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-providers-'))
  const store = new ProviderStore(directory, new CredentialVault(directory, cipher))
  return { service: new ProviderService(store, models === undefined ? {} : { models }), store }
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

/** The scripted runtime for the stored connection: provider `local` serving model `a`. */
const scripted = (): Models =>
  scriptedModels([() => textStream('ready')], [{ ...aModel(), id: 'a', provider: 'local' }])

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
 * Whether a provider answers is asked of the model runtime itself (ADR-0025): the same
 * createModelRuntime a conversation dials, one trivial turn, and the reason spelled out when there
 * is no answer — a wrong key, an unreachable base URL, a model nobody serves.
 */
describe('[agent-runtime] asking a provider whether it answers', () => {
  it('answers with the model’s own words, from a real drive of the runtime', async () => {
    const { service: providers } = service(scripted)
    providers.save(endpoint)
    providers.saveModels('local', [model('a')])
    providers.setCredential('local', 'sk-test')

    expect(await providers.test('local', 'a')).toEqual({ ok: true, message: 'ready' })
  })

  it('refuses a provider with no key, without dialing', async () => {
    const { service: providers } = service(scripted)
    providers.save(endpoint)
    providers.saveModels('local', [model('a')])

    expect(await providers.test('local', 'a')).toMatchObject({ ok: false })
    expect((await providers.test('local', 'a')).message).toContain('key')
  })

  it('refuses a provider that is not there', async () => {
    const { service: providers } = service(scripted)

    expect(await providers.test('nobody', 'a')).toMatchObject({ ok: false, message: 'No provider nobody' })
  })

  it('refuses a model the provider does not serve', async () => {
    const { service: providers } = service(scripted)
    providers.save(endpoint)
    providers.saveModels('local', [model('a')])
    providers.setCredential('local', 'sk-test')

    expect((await providers.test('local', 'ghost')).message).toContain('does not serve')
  })

  it('says why when the provider cannot be reached', async () => {
    const { service: providers } = service()
    providers.save({ ...endpoint, baseUrl: 'http://127.0.0.1:9/v1' }) // constraints-ignore 03-product-scope: loopback refuse port, dials nothing
    providers.saveModels('local', [model('a')])
    providers.setCredential('local', 'sk-test')

    const answer = await providers.test('local', 'a')
    expect(answer.ok).toBe(false)
    expect(answer.message).toContain('did not answer')
  })
})

/** The words the workbench asks a provider with, which the wire has to carry. */
const ASKED = 'Reply with the single word: ready'

/**
 * What a base url holds per wire: the OpenAI-shaped clients append only the resource, so the
 * version segment is part of what the person types; the Anthropic client appends `/v1/messages`
 * itself, so its base url is the host. The protocol is what decides how the field is read.
 */
const BASE_PATH: Record<ProviderApi, string> = {
  'openai-completions': '/v1',
  'openai-responses': '/v1',
  'anthropic-messages': '',
}

/**
 * The three wires Alpha stores (ADR-0015), each driven for real: a stored provider points at a
 * loopback endpoint that speaks that protocol, and the button that asks whether a provider answers
 * is what runs. What the wire carried is read back — the path, the auth header, the body — because
 * those are what speaking a protocol means, and the words that come out the far end are the proof
 * the answer was parsed rather than merely received.
 *
 * A text turn only: the tool-call shapes each wire also has are the agent's business, and the
 * scripted provider already covers that loop without a socket.
 */
describe('[agent-runtime] the three wires a provider can speak', () => {
  afterEach(closeScriptedWires)

  /** A stored provider whose connection is a loopback endpoint speaking `api`. */
  const asking = async (api: ProviderApi, authStyle?: ProviderAuthStyle) => {
    const wire = await startScriptedWire(api)
    const { service: providers } = service()
    providers.save({
      id: 'local',
      name: 'Local',
      api,
      baseUrl: `http://127.0.0.1:${wire.port}${BASE_PATH[api]}`,
      ...(authStyle === undefined ? {} : { authStyle }),
    })
    providers.saveModels('local', [model('a')])
    providers.setCredential('local', 'sk-test')
    return { wire, providers }
  }

  it('openai-completions: chat completions, the key as a bearer, the answer parsed', async () => {
    const { wire, providers } = await asking('openai-completions')

    expect(await providers.test('local', 'a')).toEqual({ ok: true, message: 'ready' })
    const [arrived] = wire.requests
    expect(arrived).toMatchObject({
      method: 'POST',
      path: '/v1/chat/completions',
      headers: { authorization: 'Bearer sk-test' },
      body: { model: 'a', stream: true },
    })
    expect(JSON.stringify(arrived?.body)).toContain(ASKED)
  })

  it('openai-responses: responses, the key as a bearer, the answer parsed', async () => {
    const { wire, providers } = await asking('openai-responses')

    expect(await providers.test('local', 'a')).toEqual({ ok: true, message: 'ready' })
    const [arrived] = wire.requests
    expect(arrived).toMatchObject({
      method: 'POST',
      path: '/v1/responses',
      headers: { authorization: 'Bearer sk-test' },
      body: { model: 'a', stream: true },
    })
    expect(JSON.stringify(arrived?.body)).toContain(ASKED)
  })

  it('anthropic-messages: messages, the key in x-api-key, max_tokens, the answer parsed', async () => {
    const { wire, providers } = await asking('anthropic-messages')

    expect(await providers.test('local', 'a')).toEqual({ ok: true, message: 'ready' })
    const [arrived] = wire.requests
    expect(arrived?.path).toMatch(/^\/v1\/messages/)
    expect(arrived).toMatchObject({
      method: 'POST',
      headers: { 'x-api-key': 'sk-test' },
      body: { model: 'a', stream: true, max_tokens: expect.any(Number) },
    })
    expect(arrived?.headers['anthropic-version']).toBeDefined()
    expect(JSON.stringify(arrived?.body)).toContain(ASKED)
  })

  it('anthropic-messages: a bearer-style key rides Authorization, and x-api-key is not sent', async () => {
    const { wire, providers } = await asking('anthropic-messages', 'bearer')

    expect(await providers.test('local', 'a')).toEqual({ ok: true, message: 'ready' })
    const [arrived] = wire.requests
    expect(arrived).toMatchObject({ headers: { authorization: 'Bearer sk-test' } })
    expect(arrived?.headers['x-api-key']).toBeUndefined()
  })
})
