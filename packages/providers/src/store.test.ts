import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CredentialVault, type SecretCipher } from './credential-vault.ts'
import { ProviderStore } from './store.ts'

/** The OS keychain in the two states the store has to answer for: one that reads what it wrote, and
 * one that cannot (a machine whose keychain changed under the file). */
const cipher = (unreadable: boolean): SecretCipher => ({
  available: true,
  encrypt: (plaintext) => `os:${plaintext}`,
  decrypt: (payload) => {
    if (unreadable) throw new Error('the keychain refused')
    return payload.replace('os:', '')
  },
})

/** A store over its own directory: whether the provider exists, whether a key was entered, and
 * whether that key can still be read. */
function storeIn(options: { provider?: boolean; key?: boolean; unreadable?: boolean } = {}): ProviderStore {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-store-'))
  const vault = new CredentialVault(directory, cipher(options.unreadable ?? false))
  const store = new ProviderStore(directory, vault)
  if (options.provider !== false) {
    store.save({
      id: 'local',
      name: 'Local',
      api: 'openai-completions',
      baseUrl: 'https://local.example/v1',
      models: [
        { id: 'local-7b', name: 'Local 7B', contextWindow: 32000, maxTokens: 4096, reasoning: false, images: false },
      ],
    })
  }
  if (options.key === true) vault.set('local', 'sk-local')
  return store
}

describe('[providers] keyProblem', () => {
  it('answers nothing when a key is there and readable, so the turn may start', () => {
    expect(storeIn({ key: true }).keyProblem('local')).toBeUndefined()
  })

  it('answers the case for a provider Alpha does not have', () => {
    expect(storeIn({ provider: false }).keyProblem('local')).toEqual({ kind: 'no-provider', providerId: 'local' })
  })

  /**
   * Two different things for a person to do — enter a key, or enter it again — so they are two
   * cases rather than one. Which words each gets is the window's; this only says which it is.
   */
  it('tells a key that was never entered from one that cannot be read', () => {
    expect(storeIn().keyProblem('local')).toEqual({ kind: 'no-key', providerId: 'local' })
    expect(storeIn({ key: true, unreadable: true }).keyProblem('local')).toEqual({
      kind: 'key-unreadable',
      providerId: 'local',
    })
  })
})
