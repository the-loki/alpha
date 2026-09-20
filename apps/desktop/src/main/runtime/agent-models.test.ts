import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CredentialVault, type SecretCipher } from '../providers/credential-vault.ts'
import { ProviderStore } from '../providers/store.ts'
import { credentialFor, credentialVariable, MODELS_FILE, writeModelsFile } from './agent-models.ts'

const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

const SECRET = 'sk-do-not-write-me-down'

const setup = (options: { secret?: string; cipher?: SecretCipher } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-models-'))
  const agentDirectory = join(directory, 'agent')
  const store = new ProviderStore(directory, new CredentialVault(directory, options.cipher ?? testCipher))
  store.save({
    id: 'local',
    name: 'Local',
    api: 'openai-completions',
    baseUrl: 'https://llm.internal.example/v1',
    models: [
      { id: 'local-70b', name: 'Local 70B', contextWindow: 128_000, maxTokens: 8_192, reasoning: true, images: true },
    ],
  })
  if (options.secret !== undefined) store.setCredential('local', options.secret)
  return { store, agentDirectory, directory }
}

describe('[runtime] what the agent is told about models', () => {
  it('describes the provider Alpha has, with the credential named rather than written', () => {
    const { store, agentDirectory } = setup({ secret: SECRET })

    writeModelsFile(store, agentDirectory)

    const written = readFileSync(join(agentDirectory, MODELS_FILE), 'utf-8')
    const config = JSON.parse(written) as {
      providers: Record<string, { baseUrl: string; api: string; apiKey: string; models: unknown[] }>
    }
    expect(config.providers.local).toMatchObject({
      baseUrl: 'https://llm.internal.example/v1',
      api: 'openai-completions',
      apiKey: `$${credentialVariable('local')}`,
    })
    expect(config.providers.local.models).toEqual([
      {
        id: 'local-70b',
        name: 'Local 70B',
        reasoning: true,
        input: ['text', 'image'],
        contextWindow: 128_000,
        maxTokens: 8_192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ])
    // The whole point: the file is not a secret, and the secret is not in it.
    expect(written).not.toContain(SECRET)
  })

  it('hands the credential over as an environment variable, and nothing else', () => {
    const { store } = setup({ secret: SECRET })

    const { env, problem } = credentialFor(store, 'local')

    expect(problem).toBeUndefined()
    expect(env[credentialVariable('local')]).toBe(SECRET)
    expect(Object.keys(env)).toEqual([credentialVariable('local')])
  })

  it('refuses a provider with no key, rather than starting a run that cannot finish', () => {
    const { store } = setup()

    const { env, problem } = credentialFor(store, 'local')

    expect(env).toEqual({})
    expect(problem?.message).toContain('no key for local')
  })

  it('refuses a provider that is not there at all', () => {
    const { store } = setup({ secret: SECRET })

    expect(credentialFor(store, 'nobody').problem?.message).toContain('no provider called nobody')
  })

  it('says a credential Alpha cannot read is one Alpha cannot read', () => {
    const { store } = setup({
      secret: SECRET,
      cipher: {
        available: true,
        encrypt: () => 'enc:whatever',
        decrypt: () => {
          throw new Error('the keychain is locked')
        },
      },
    })

    const { env, problem } = credentialFor(store, 'local')

    expect(env).toEqual({})
    expect(problem?.message).toContain('could not read the key for local')
  })

  it('names the variable after the provider, so both sides of a spawn agree', () => {
    expect(credentialVariable('local')).toBe('ALPHA_ADAPTER_KEY_LOCAL')
    expect(credentialVariable('my-vendor.io')).toBe('ALPHA_ADAPTER_KEY_MY_VENDOR_IO')
  })
})
