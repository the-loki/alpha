/**
 * Providers as data: which endpoints the workbench may talk to, and which models each one
 * serves. The credential is never part of this — a provider here is the shape of the connection,
 * and whether a key is stored is a separate fact the UI asks for.
 */
import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'
import { type CatalogEntry, PROVIDER_CATALOG } from './providers/templates.ts'

export const PROVIDER_APIS = ['openai-completions', 'anthropic-messages'] as const

export type ProviderApi = (typeof PROVIDER_APIS)[number]

export interface ProviderModelDefinition {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  reasoning: boolean
}

export interface StoredProvider {
  id: string
  name: string
  api: ProviderApi
  baseUrl: string
  models: ProviderModelDefinition[]
  /** Where this provider came from, so settings can explain it and offer the right edits. */
  source: 'catalog' | 'custom'
  catalogId?: string
}

/** A provider as the settings screen sees it: the definition plus whether a key is stored. */
export interface ProviderView extends StoredProvider {
  hasCredential: boolean
}

export interface ProviderIndex {
  version: 1
  providers: StoredProvider[]
}

export function isProviderApi(value: unknown): value is ProviderApi {
  return typeof value === 'string' && (PROVIDER_APIS as readonly string[]).includes(value)
}

const ModelSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  contextWindow: Type.Number(),
  maxTokens: Type.Number(),
  reasoning: Type.Boolean(),
})

const ProviderSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  api: Type.Union(PROVIDER_APIS.map((api) => Type.Literal(api))),
  baseUrl: Type.String(),
  models: Type.Array(ModelSchema),
  source: Type.Union([Type.Literal('catalog'), Type.Literal('custom')]),
  catalogId: Type.Optional(Type.String()),
})

const ProviderIndexSchema = Type.Object({
  version: Type.Literal(1),
  providers: Type.Array(ProviderSchema),
})

export function emptyProviderIndex(): ProviderIndex {
  return { version: 1, providers: [] }
}

export function parseProviders(raw: unknown): ProviderIndex {
  const candidate = typeof raw === 'string' ? parseJson(raw) : raw
  if (!Value.Check(ProviderIndexSchema, candidate)) return emptyProviderIndex()
  const index: Static<typeof ProviderIndexSchema> = candidate
  return { version: 1, providers: index.providers }
}

export function findCatalogEntry(id: string): CatalogEntry | undefined {
  return PROVIDER_CATALOG.find((entry) => entry.id === id)
}

export function providerFromCatalog(entry: CatalogEntry, models: ProviderModelDefinition[]): StoredProvider {
  return {
    id: entry.id,
    name: entry.name,
    api: entry.api,
    baseUrl: entry.baseUrl,
    models,
    source: 'catalog',
    catalogId: entry.id,
  }
}

export interface CustomProviderResult {
  provider?: StoredProvider
  error?: string
}

/** Validates a hand-written provider definition, naming the first thing that is wrong. */
export function customProvider(input: unknown): CustomProviderResult {
  if (typeof input !== 'object' || input === null) return { error: 'a provider must be an object' }
  const candidate = input as Record<string, unknown>

  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return { error: 'the id must be lower-case letters, digits and dashes' }
  }

  const name = typeof candidate.name === 'string' && candidate.name.trim() !== '' ? candidate.name.trim() : id

  if (!isProviderApi(candidate.api)) return { error: 'the wire protocol must be one Alpha speaks' }

  const baseUrl = typeof candidate.baseUrl === 'string' ? candidate.baseUrl.trim() : ''
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) return { error: 'the base url must be an http(s) address' }

  if (!Array.isArray(candidate.models) || candidate.models.length === 0) {
    return { error: 'a provider needs at least one model' }
  }

  const models: ProviderModelDefinition[] = []
  for (const entry of candidate.models) {
    if (typeof entry !== 'object' || entry === null) return { error: 'every model must be an object' }
    const model = entry as Record<string, unknown>
    const modelId = typeof model.id === 'string' ? model.id.trim() : ''
    if (modelId === '') return { error: 'every model needs an id' }
    const contextWindow = typeof model.contextWindow === 'number' ? model.contextWindow : 0
    if (contextWindow <= 0) return { error: 'every model needs a context window above zero' }
    models.push({
      id: modelId,
      name: typeof model.name === 'string' && model.name.trim() !== '' ? model.name.trim() : modelId,
      contextWindow,
      maxTokens: typeof model.maxTokens === 'number' && model.maxTokens > 0 ? model.maxTokens : 4096,
      reasoning: model.reasoning === true,
    })
  }

  return { provider: { id, name, api: candidate.api, baseUrl, models, source: 'custom' } }
}

export interface CredentialRequirement {
  kind: 'missing' | 'present'
  reason: string
}

export function credentialRequirement(input: { hasCredential: boolean }): CredentialRequirement {
  return input.hasCredential
    ? { kind: 'present', reason: 'A key is stored for this provider.' }
    : { kind: 'missing', reason: 'No key is stored yet. Add one to use this provider.' }
}

export function providerLabel(provider: StoredProvider): string {
  return `${provider.name} · ${provider.models.length} ${provider.models.length === 1 ? 'model' : 'models'}`
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
