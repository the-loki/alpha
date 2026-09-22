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
  effectiveModelOf,
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

  /** What the user chose, which may be nothing: the models panel shows this one as selected. */
  chosenModel(): Undef<ConversationModel> {
    return defaultModelOf(this.#index)
  }

  /** What a new conversation actually starts on: the choice, or the first model there is. */
  effectiveModel(): Undef<ConversationModel> {
    return effectiveModelOf(this.#index)
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

  /**
   * Why a run or a test is refused before a provider is asked anything: there is no key to dial
   * with, in the person's terms rather than the vault's (#114). Nothing to refuse means a key is
   * there — answered to the model runtime at request time, never spoken here (C2.4).
   */
  keyProblem(id: string): Undef<string> {
    if (this.find(id) === undefined) return `Alpha has no provider called ${id}.`
    let secret: Undef<string>
    try {
      secret = this.credential(id)
    } catch {
      return `Alpha could not read the key for ${id}. Enter it again under Settings, Providers.`
    }
    if (secret === undefined || secret === '') {
      return `Alpha has no key for ${id}. Add one under Settings, Providers.`
    }
    return undefined
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
