import type { StoredProvider } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
import { createModelRuntime } from './model-runtime.ts'

const aProvider = (overrides: Partial<StoredProvider> = {}): StoredProvider => ({
  id: 'scripted',
  name: 'Scripted',
  api: 'openai-completions',
  baseUrl: 'https://llm.internal.example/v1',
  models: [
    {
      id: 'scripted-model',
      name: 'Scripted model',
      contextWindow: 32000,
      maxTokens: 4096,
      reasoning: false,
      images: true,
    },
  ],
  ...overrides,
})

describe('the model runtime Alpha dials with', () => {
  it('passes configured USD-per-million-token rates through to pi-ai', () => {
    const rates = { input: 1.5, output: 6, cacheRead: 0.15, cacheWrite: 1.875 }
    const models = createModelRuntime({
      providers: [aProvider({ models: [{ ...aProvider().models[0], rates }] })],
      credential: () => 'a key',
    })
    expect(models.getModel('scripted', 'scripted-model')?.cost).toEqual(rates)
  })

  it('builds one provider per configured one, with its models', () => {
    const models = createModelRuntime({
      providers: [aProvider(), aProvider({ id: 'other', models: [] })],
      credential: () => 'a key',
    })
    expect(models.getProviders().map((provider) => provider.id)).toEqual(['scripted', 'other'])
    expect(models.getModel('scripted', 'scripted-model')?.contextWindow).toBe(32000)
    expect(models.getModel('scripted', 'scripted-model')?.input).toEqual(['text', 'image'])
  })

  it('answers auth from the vault at request time, not from a file', async () => {
    const models = createModelRuntime({ providers: [aProvider()], credential: () => 'the vault key' })
    const model = models.getModel('scripted', 'scripted-model')
    expect(model === undefined ? undefined : await models.getAuth(model)).toMatchObject({
      auth: { apiKey: 'the vault key' },
    })
  })

  it('a bearer-style key rides the Authorization header instead of the api-key one', async () => {
    const models = createModelRuntime({
      providers: [aProvider({ authStyle: 'bearer' })],
      credential: () => 'the vault key',
    })
    const model = models.getModel('scripted', 'scripted-model')
    expect(model === undefined ? undefined : await models.getAuth(model)).toMatchObject({
      auth: { headers: { authorization: 'Bearer the vault key' } },
    })
  })

  it('a missing key is no key: the model exists and is simply not available', async () => {
    const models = createModelRuntime({ providers: [aProvider()], credential: () => undefined })
    const model = models.getModel('scripted', 'scripted-model')
    expect(model).toBeDefined()
    expect(model === undefined ? undefined : await models.getAuth(model)).toBeUndefined()
    expect(await models.getAvailable()).toEqual([])
  })

  it('each wire protocol Alpha stores is the one the model speaks', () => {
    const models = createModelRuntime({
      providers: [aProvider({ id: 'a', api: 'openai-completions' }), aProvider({ id: 'b', api: 'anthropic-messages' })],
      credential: () => 'k',
    })
    expect(models.getModel('a', 'scripted-model')?.api).toBe('openai-completions')
    expect(models.getModel('b', 'scripted-model')?.api).toBe('anthropic-messages')
  })
})
