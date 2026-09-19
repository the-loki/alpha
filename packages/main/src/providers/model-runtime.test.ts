import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CredentialVault } from './credential-vault.ts'
import { createProviderModelRuntime } from './model-runtime.ts'
import { ProviderStore } from './store.ts'

/** A stand-in for the OS keychain, so what is stored is readable in a test. */
const cipher = {
  available: true,
  encrypt: (plaintext: string) => `sealed:${plaintext}`,
  decrypt: (payload: string) => payload.replace('sealed:', ''),
}

const runtimeWithTwoModels = () => {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-runtime-'))
  const store = new ProviderStore(directory, new CredentialVault(directory, cipher))
  store.save({
    id: 'local',
    name: 'Local',
    api: 'openai-completions',
    baseUrl: 'https://llm.internal.example/v1',
    models: [
      { id: 'vision', name: 'Vision', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images: true },
      { id: 'text-only', name: 'Text', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images: false },
    ],
  })
  return createProviderModelRuntime(store)
}

/**
 * What the model is declared able to read. This is the flag every protocol in pi-ai consults
 * before it puts an image in a request, and leaving it at text-only for every model is what made
 * an attachment a picture the model was never shown (ADR-0018).
 */
describe('[main] what a model is declared able to read', () => {
  it('includes pictures for a model that takes them, and not for one that does not', () => {
    const runtime = runtimeWithTwoModels()

    expect(runtime.models.getModel('local', 'vision')?.input).toEqual(['text', 'image'])
    expect(runtime.models.getModel('local', 'text-only')?.input).toEqual(['text'])
  })
})
