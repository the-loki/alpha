/**
 * Providers as data: an endpoint the workbench may talk to, the protocol it speaks, and the models
 * it serves. The credential is never part of this — whether a key is stored is a separate fact the
 * settings screen asks for.
 *
 * There is no catalog. Alpha ships no host and no model id, so a provider is always something the
 * user described themselves; what it does ship is the three wire protocols that cover the
 * mainstream — OpenAI's chat completions (which most gateways also speak), Anthropic's messages,
 * and Google's generative AI (ADR-0015). A model list is not part of the connection either: which
 * models an endpoint serves is a model setting, not a fact about the endpoint.
 */

import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'
import type { Undef } from './maybe.ts'
import type { ConversationModel } from './runtime-events.ts'

export const PROVIDER_APIS = ['openai-completions', 'anthropic-messages', 'google-generative-ai'] as const

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
}

/** A provider as the settings screen sees it: the definition plus whether a key is stored. */
export interface ProviderView extends StoredProvider {
  hasCredential: boolean
}

export interface ProviderIndex {
  version: 1
  providers: StoredProvider[]
  /**
   * What a new conversation starts on, and what a run with nobody watching uses. Absent means the
   * first model of the first provider that has one, which is what a single-provider setup wants.
   */
  defaultModel?: ConversationModel
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

const ModelRefSchema = Type.Object({ providerId: Type.String(), modelId: Type.String() })

const ProviderSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  api: Type.Union(PROVIDER_APIS.map((api) => Type.Literal(api))),
  baseUrl: Type.String(),
  models: Type.Array(ModelSchema),
})

const ProviderIndexSchema = Type.Object({
  version: Type.Literal(1),
  providers: Type.Array(ProviderSchema),
  defaultModel: Type.Optional(ModelRefSchema),
})

export function emptyProviderIndex(): ProviderIndex {
  return { version: 1, providers: [] }
}

export function parseProviders(raw: unknown): ProviderIndex {
  const candidate = typeof raw === 'string' ? parseJson(raw) : raw
  if (!Value.Check(ProviderIndexSchema, candidate)) return emptyProviderIndex()
  const index: Static<typeof ProviderIndexSchema> = candidate
  return {
    version: 1,
    providers: index.providers.map((provider) => ({ ...provider, models: provider.models })),
    defaultModel: index.defaultModel,
  }
}

/** What the provider form sends: the connection, and nothing about models. */
export interface ProviderInput {
  id: string
  name: string
  api: ProviderApi
  baseUrl: string
}

export interface ProviderResult {
  provider?: ProviderInput
  error?: string
}

/** Validates a hand-written provider, naming the first thing that is wrong. */
export function readProvider(input: unknown): ProviderResult {
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

  return { provider: { id, name, api: candidate.api, baseUrl } }
}

export interface ModelsResult {
  models?: ProviderModelDefinition[]
  error?: string
}

/**
 * Validates a model list. Models are added, removed and corrected as a list, so this is one rule
 * with two callers: a provider written down for the first time, and a list edited later. An empty
 * list is a provider that serves nothing yet — a state to be shown, not an error to be refused.
 */
export function readModels(input: unknown): ModelsResult {
  if (!Array.isArray(input)) return { error: 'models must be a list' }
  const models: ProviderModelDefinition[] = []
  for (const entry of input) {
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
  return { models }
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

/**
 * The stored default, when it still points at a model some provider actually serves. This is the
 * one guard: the choice is written down once and checked every time it is read, so removing a
 * model or a provider cannot leave the workbench pointing at nothing.
 */
export function defaultModelOf(index: ProviderIndex): Undef<ConversationModel> {
  const chosen = index.defaultModel
  if (chosen === undefined) return undefined
  const provider = index.providers.find((candidate) => candidate.id === chosen.providerId)
  if (provider === undefined) return undefined
  return provider.models.some((model) => model.id === chosen.modelId) ? chosen : undefined
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
