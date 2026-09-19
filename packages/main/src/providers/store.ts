/**
 * The configured providers, and the credentials that go with them. Two files, because they have
 * two different lifetimes: a provider definition is ordinary configuration and a credential is a
 * secret with its own protection story (ADR-0003). Deleting a provider deletes its secret.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ConversationModel,
  defaultModelOf,
  emptyProviderIndex,
  type ProviderIndex,
  type ProviderModelDefinition,
  type ProviderView,
  parseProviders,
  type StoredProvider,
  type Undef,
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

  find(id: string): Undef<StoredProvider> {
    return this.#index.providers.find((provider) => provider.id === id)
  }

  save(provider: StoredProvider): void {
    const others = this.#index.providers.filter((existing) => existing.id !== provider.id)
    this.#index = { ...this.#index, providers: [...others, provider] }
    this.#flush()
  }

  /** The model list of one provider, which is the models panel's whole job. */
  saveModels(id: string, models: ProviderModelDefinition[]): void {
    const provider = this.find(id)
    if (provider === undefined) throw new Error(`No provider ${id}`)
    // The chosen default is not touched: it is checked where it is read, so a model that goes
    // away cannot leave the workbench pointing at nothing (defaultModelOf).
    this.save({ ...provider, models })
  }

  defaultModel(): Undef<ConversationModel> {
    return defaultModelOf(this.#index)
  }

  setDefaultModel(chosen: Undef<ConversationModel>): void {
    this.#index = { ...this.#index, defaultModel: chosen }
    this.#flush()
  }

  remove(id: string): void {
    this.#index = { ...this.#index, providers: this.#index.providers.filter((provider) => provider.id !== id) }
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
  credential(id: string): Undef<string> {
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
