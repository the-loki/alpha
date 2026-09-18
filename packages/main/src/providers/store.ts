/**
 * The configured providers, and the credentials that go with them. Two files, because they have
 * two different lifetimes: a provider definition is ordinary configuration and a credential is a
 * secret with its own protection story (ADR-0003). Deleting a provider deletes its secret.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emptyProviderIndex,
  type ProviderIndex,
  type ProviderView,
  parseProviders,
  type StoredProvider,
} from '@alpha/core'
import type { CredentialProtection, CredentialVault } from './credential-vault.ts'

export class ProviderStore {
  readonly #path: string
  readonly #vault: CredentialVault
  #index: ProviderIndex

  constructor(dataDirectory: string, vault: CredentialVault) {
    this.#path = join(dataDirectory, 'providers.json')
    this.#vault = vault
    this.#index = this.#read()
  }

  list(): StoredProvider[] {
    return [...this.#index.providers]
  }

  /** What the settings screen gets: definitions plus whether a key is stored, never the key. */
  views(): ProviderView[] {
    return this.#index.providers.map((provider) => ({ ...provider, hasCredential: this.#vault.has(provider.id) }))
  }

  find(id: string): StoredProvider | undefined {
    return this.#index.providers.find((provider) => provider.id === id)
  }

  save(provider: StoredProvider): void {
    const others = this.#index.providers.filter((existing) => existing.id !== provider.id)
    this.#index = { version: 1, providers: [...others, provider] }
    this.#flush()
  }

  remove(id: string): void {
    this.#index = { version: 1, providers: this.#index.providers.filter((provider) => provider.id !== id) }
    this.#flush()
    this.#vault.remove(id)
  }

  setCredential(id: string, secret: string): void {
    this.#vault.set(id, secret)
  }

  hasCredential(id: string): boolean {
    return this.#vault.has(id)
  }

  /** Main-process only: the model runtime is the one caller. */
  credential(id: string): string | undefined {
    return this.#vault.credential(id)
  }

  protection(): CredentialProtection {
    return this.#vault.protection()
  }

  #flush(): void {
    writeFileSync(this.#path, JSON.stringify(this.#index, null, 2), 'utf-8')
  }

  #read(): ProviderIndex {
    try {
      return parseProviders(readFileSync(this.#path, 'utf-8'))
    } catch {
      return emptyProviderIndex()
    }
  }
}
