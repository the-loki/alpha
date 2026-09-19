/**
 * Where the user's keys live. Encrypted with the OS keychain through Electron's `safeStorage`
 * when it is available, in plaintext with the user told so when it is not (ADR-0003).
 *
 * The vault is main-process-only by construction: nothing here is wired to an IPC channel that
 * returns a secret, and `credential()` is called by the model runtime and nobody else.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Absent } from '@alpha/core'
import { Type } from 'typebox'
import { Value } from 'typebox/value'

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

/** The file's shape, checked with the same tool every other boundary uses (C1.4). */
const VaultSchema = Type.Object({
  version: Type.Literal(1),
  entries: Type.Array(
    Type.Object({
      providerId: Type.String(),
      protection: Type.Union([Type.Literal('os'), Type.Literal('plaintext')]),
      payload: Type.String(),
    }),
  ),
})

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
  credential(providerId: string): Absent<string> {
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
    const file = { version: 1 as const, entries: this.#entries }
    writeFileSync(this.#path, JSON.stringify(file, null, 2), 'utf-8')
  }

  /** A file that does not match is treated as empty, for the same reason the workbench state is. */
  #read(): VaultEntry[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.#path, 'utf-8'))
      if (!Value.Check(VaultSchema, parsed)) return []
      return Value.Decode(VaultSchema, parsed).entries
    } catch {
      return []
    }
  }
}
