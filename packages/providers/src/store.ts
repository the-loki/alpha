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
  type ModelIndex,
  type ProviderIndex,
  type ProviderModelDefinition,
  type ProviderView,
  parseProviders,
  type StoredProvider,
  type TurnRefusal,
  type Undef,
} from '@alpha/domain'
import type { CredentialProtection, CredentialVault } from './credential-vault.ts'

export class ProviderStore {
  private readonly path: string
  private readonly vault: CredentialVault
  private file: ProviderIndex

  public constructor(dataDirectory: string, vault: CredentialVault) {
    this.path = join(dataDirectory, 'providers.json')
    this.vault = vault
    this.file = this.read()
  }

  public list(): StoredProvider[] {
    return [...this.file.providers]
  }

  /** What the settings screen gets: definitions plus whether a key is stored, never the key. */
  public views(): ProviderView[] {
    return this.file.providers.map((provider) => ({ ...provider, hasCredential: this.vault.has(provider.id) }))
  }

  public find(id: string): Undef<StoredProvider> {
    return this.file.providers.find((provider) => provider.id === id)
  }

  /** The two facts every model rule reads, in the shape `@alpha/domain`'s rules take them. */
  public index(): ModelIndex {
    return this.file
  }

  public save(provider: StoredProvider): void {
    const others = this.file.providers.filter((existing) => existing.id !== provider.id)
    this.file = { ...this.file, providers: [...others, provider] }
    this.flush()
  }

  /** The model list of one provider, which is the models panel's whole job. */
  public saveModels(id: string, models: ProviderModelDefinition[]): void {
    const provider = this.find(id)
    if (provider === undefined) throw new Error(`No provider ${id}`)
    // The chosen default is not touched: it is checked where it is read, so a model that goes
    // away cannot leave the workbench pointing at nothing (defaultModelOf).
    this.save({ ...provider, models })
  }

  /** What the user chose, which may be nothing: the models panel shows this one as selected. */
  public chosenModel(): Undef<ConversationModel> {
    return defaultModelOf(this.file)
  }

  /** What a new conversation actually starts on: the choice, or the first model there is. */
  public effectiveModel(): Undef<ConversationModel> {
    return effectiveModelOf(this.file)
  }

  public setDefaultModel(chosen: Undef<ConversationModel>): void {
    this.file = { ...this.file, defaultModel: chosen }
    this.flush()
  }

  public remove(id: string): void {
    this.file = { ...this.file, providers: this.file.providers.filter((provider) => provider.id !== id) }
    this.flush()
    this.vault.remove(id)
  }

  public setCredential(id: string, secret: string): void {
    this.vault.set(id, secret)
  }

  public hasCredential(id: string): boolean {
    return this.vault.has(id)
  }

  /** Main-process only: the model runtime is the one caller. */
  public credential(id: string): Undef<string> {
    return this.vault.credential(id)
  }

  /**
   * Why a run or a test is refused before a provider is asked anything: there is no key to dial
   * with (#114). It is a case rather than a sentence, because the sentence is the window's and this
   * is not the thing with a language (ADR-0010) — and the three cases are three different things
   * for a person to do. Nothing to refuse means a key is there — answered to the model runtime at
   * request time, never spoken here (C2.4).
   */
  public keyProblem(id: string): Undef<TurnRefusal> {
    if (this.find(id) === undefined) return { kind: 'no-provider', providerId: id }
    let secret: Undef<string>
    try {
      secret = this.credential(id)
    } catch {
      return { kind: 'key-unreadable', providerId: id }
    }
    if (secret === undefined || secret === '') return { kind: 'no-key', providerId: id }
    return undefined
  }

  public protection(): CredentialProtection {
    return this.vault.protection()
  }

  private flush(): void {
    writeFileSync(this.path, JSON.stringify(this.file, null, 2), 'utf-8')
  }

  private read(): ProviderIndex {
    try {
      return parseProviders(readFileSync(this.path, 'utf-8'))
    } catch {
      return emptyProviderIndex()
    }
  }
}
