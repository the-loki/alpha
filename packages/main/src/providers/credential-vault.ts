/**
 * Where the user's keys live. Encrypted with the OS keychain through Electron's `safeStorage`
 * when it is available, in plaintext with the user told so when it is not (ADR-0003).
 *
 * The vault is main-process-only by construction: nothing here is wired to an IPC channel that
 * returns a secret, and `credential()` is called by the model runtime and nobody else.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface SecretCipher {
  /** False when the OS offers no keychain, in which case secrets are stored in plaintext. */
  available: boolean
  encrypt(plaintext: string): string
  decrypt(payload: string): string
}

export type CredentialProtection = 'os' | 'plaintext'

interface VaultEntry {
  providerId: string
  protection: CredentialProtection
  payload: string
}

interface VaultFile {
  version: 1
  entries: VaultEntry[]
}

export class CredentialVault {
  readonly #path: string
  readonly #cipher: SecretCipher
  #entries: VaultEntry[]

  constructor(dataDirectory: string, cipher: SecretCipher) {
    this.#path = join(dataDirectory, 'credentials.json')
    this.#cipher = cipher
    this.#entries = this.#read()
  }

  protection(): CredentialProtection {
    return this.#cipher.available ? 'os' : 'plaintext'
  }

  has(providerId: string): boolean {
    return this.#entries.some((entry) => entry.providerId === providerId)
  }

  /** Main-process only. Never expose this over IPC. */
  credential(providerId: string): string | undefined {
    const entry = this.#entries.find((candidate) => candidate.providerId === providerId)
    if (entry === undefined) return undefined
    return entry.protection === 'os' ? this.#cipher.decrypt(entry.payload) : entry.payload
  }

  set(providerId: string, secret: string): void {
    const protection = this.protection()
    const payload = protection === 'os' ? this.#cipher.encrypt(secret) : secret
    this.#entries = [
      ...this.#entries.filter((entry) => entry.providerId !== providerId),
      { providerId, protection, payload },
    ]
    this.#flush()
  }

  remove(providerId: string): void {
    this.#entries = this.#entries.filter((entry) => entry.providerId !== providerId)
    this.#flush()
  }

  ids(): string[] {
    return this.#entries.map((entry) => entry.providerId)
  }

  #flush(): void {
    const file: VaultFile = { version: 1, entries: this.#entries }
    writeFileSync(this.#path, JSON.stringify(file, null, 2), 'utf-8')
  }

  #read(): VaultEntry[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.#path, 'utf-8'))
      if (typeof parsed !== 'object' || parsed === null) return []
      const file = parsed as VaultFile
      if (file.version !== 1 || !Array.isArray(file.entries)) return []
      return file.entries.filter(
        (entry) =>
          typeof entry?.providerId === 'string' &&
          typeof entry?.payload === 'string' &&
          typeof entry?.protection === 'string',
      )
    } catch {
      return []
    }
  }
}
