import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CredentialVault, type SecretCipher } from './credential-vault.ts'

/** A stand-in for the OS keychain, so the vault's behaviour is testable without Electron. */
const reversibleCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `sealed:${Buffer.from(plaintext).toString('base64')}`,
  decrypt: (payload) => Buffer.from(payload.replace('sealed:', ''), 'base64').toString('utf-8'),
}

const plaintextCipher: SecretCipher = {
  available: false,
  encrypt: (plaintext) => plaintext,
  decrypt: (payload) => payload,
}

const vaultIn = (cipher: SecretCipher) => {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-vault-'))
  return { vault: new CredentialVault(directory, cipher), file: join(directory, 'credentials.json') }
}

describe('[main] with the OS keychain available', () => {
  it('reports a stored credential', () => {
    const { vault } = vaultIn(reversibleCipher)
    expect(vault.has('anthropic')).toBe(false)
    vault.set('anthropic', 'sk-ant-123')
    expect(vault.has('anthropic')).toBe(true)
  })

  it('hands the credential back to the main process', () => {
    const { vault } = vaultIn(reversibleCipher)
    vault.set('anthropic', 'sk-ant-123')
    expect(vault.credential('anthropic')).toBe('sk-ant-123')
  })

  it('never writes the secret in readable form', () => {
    const { vault, file } = vaultIn(reversibleCipher)
    vault.set('anthropic', 'sk-ant-super-secret')
    expect(readFileSync(file, 'utf-8')).not.toContain('sk-ant-super-secret')
  })

  it('replaces a credential rather than keeping both', () => {
    const { vault } = vaultIn(reversibleCipher)
    vault.set('anthropic', 'first')
    vault.set('anthropic', 'second')
    expect(vault.credential('anthropic')).toBe('second')
    expect(vault.ids()).toEqual(['anthropic'])
  })

  it('forgets a credential when it is removed', () => {
    const { vault, file } = vaultIn(reversibleCipher)
    vault.set('anthropic', 'sk-ant-123')
    vault.remove('anthropic')
    expect(vault.has('anthropic')).toBe(false)
    expect(vault.credential('anthropic')).toBeUndefined()
    expect(readFileSync(file, 'utf-8')).not.toContain('sk-ant')
  })

  it('reports the protection it used', () => {
    expect(vaultIn(reversibleCipher).vault.protection()).toBe('os')
  })

  it('reads back a vault written by a previous run', () => {
    const { vault, file } = vaultIn(reversibleCipher)
    vault.set('groq', 'gsk_123')
    const reopened = new CredentialVault(file.replace('/credentials.json', ''), reversibleCipher)
    expect(reopened.credential('groq')).toBe('gsk_123')
  })

  it('is empty when the file is garbage', () => {
    const { vault } = vaultIn(reversibleCipher)
    vault.set('groq', 'gsk_123')
    const broken = new CredentialVault('/nonexistent-directory-for-alpha-tests', reversibleCipher)
    expect(broken.ids()).toEqual([])
  })
})

describe('[main] with no keychain available', () => {
  it('says so, so the UI can warn', () => {
    expect(vaultIn(plaintextCipher).vault.protection()).toBe('plaintext')
  })

  it('still round-trips a credential', () => {
    const { vault } = vaultIn(plaintextCipher)
    vault.set('openai', 'sk-123')
    expect(vault.credential('openai')).toBe('sk-123')
  })
})
