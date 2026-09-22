/**
 * Providers as data: an endpoint the workbench may talk to, the protocol it speaks, and the models
 * it serves. The credential is never part of this — whether a key is stored is a separate fact the
 * settings screen asks for.
 *
 * There is no catalog. Alpha ships no host and no model id, so a provider is always something the
 * user described themselves; what it does ship is the three wire protocols that cover the
 * mainstream — OpenAI's chat completions (which most gateways also speak), OpenAI's responses, and
 * Anthropic's messages (ADR-0015). A model list is not part of the connection either: which models
 * an endpoint serves is a model setting, not a fact about the endpoint.
 */

import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'
import type { Undef } from './maybe.ts'
import type { ConversationModel } from './runtime-events.ts'

export const PROVIDER_APIS = ['openai-completions', 'openai-responses', 'anthropic-messages'] as const

export type ProviderApi = (typeof PROVIDER_APIS)[number]

/**
 * How the stored key rides the request — a fact about the endpoint, not about the key. Absent (the
 * whole default) is the wire's own api-key header; `bearer` is Authorization: Bearer, for the
 * gateways that take nothing else even on a wire whose native style is the other one.
 */
export const PROVIDER_AUTH_STYLES = ['api-key', 'bearer'] as const

export type ProviderAuthStyle = (typeof PROVIDER_AUTH_STYLES)[number]

export interface ProviderModelDefinition {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  reasoning: boolean
  /**
   * Whether this model can be handed a picture. It is a setting rather than a fact because there
   * is no catalog to ask (ADR-0015) — and it is not cosmetic: a model that does not say it takes
   * pictures is sent text only, so an attachment to one is refused rather than dropped on the way
   * out (ADR-0018).
   */
  images: boolean
}

export interface StoredProvider {
  id: string
  name: string
  api: ProviderApi
  baseUrl: string
  /** How the key rides: absent is the wire's own api-key header, `bearer` is Authorization. */
  authStyle?: ProviderAuthStyle
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

export function isProviderAuthStyle(value: unknown): value is ProviderAuthStyle {
  return typeof value === 'string' && (PROVIDER_AUTH_STYLES as readonly string[]).includes(value)
}

const ModelSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  contextWindow: Type.Number(),
  maxTokens: Type.Number(),
  reasoning: Type.Boolean(),
  // Optional in the schema and defaulted below: a file written before this setting existed is
  // still a valid file, and it is read as a model that takes text only.
  images: Type.Optional(Type.Boolean()),
})

const ModelRefSchema = Type.Object({ providerId: Type.String(), modelId: Type.String() })

const ProviderSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  api: Type.Union(PROVIDER_APIS.map((api) => Type.Literal(api))),
  baseUrl: Type.String(),
  // Optional in the schema like `images` above: a file written before this setting existed is
  // still a valid file, read as the wire's own api-key style.
  authStyle: Type.Optional(Type.Union(PROVIDER_AUTH_STYLES.map((style) => Type.Literal(style)))),
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
    providers: index.providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({ ...model, images: model.images === true })),
    })),
    defaultModel: index.defaultModel,
  }
}

/** What the provider form sends: the connection, and nothing about models. */
export interface ProviderInput {
  id: string
  name: string
  api: ProviderApi
  baseUrl: string
  authStyle?: ProviderAuthStyle
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

  if (candidate.authStyle !== undefined && !isProviderAuthStyle(candidate.authStyle)) {
    return { error: 'the auth style must be api-key or bearer' }
  }

  return {
    provider: {
      id,
      name,
      api: candidate.api,
      baseUrl,
      ...(candidate.authStyle === undefined ? {} : { authStyle: candidate.authStyle }),
    },
  }
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
      // Off unless it is said: a picture sent to a model that cannot read one is a turn that
      // answers about nothing, which is worse than being told to turn the setting on.
      images: model.images === true,
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
 * The two facts every model rule reads. A window's snapshot carries them with more around them, so
 * typing the rules on this rather than on the whole index is what lets the window ask the same
 * questions the main process asks instead of keeping a second copy of the answers.
 */
export type ModelIndex = Pick<ProviderIndex, 'providers' | 'defaultModel'>

/**
 * The stored default, when it still points at a model some provider actually serves. This is the
 * one guard: the choice is written down once and checked every time it is read, so removing a
 * model or a provider cannot leave the workbench pointing at nothing.
 */
export function defaultModelOf(index: ModelIndex): Undef<ConversationModel> {
  const chosen = index.defaultModel
  if (chosen === undefined || !servesModel(index, chosen)) return undefined
  return chosen
}

/** The first model there is, for a workbench that has never had one chosen for it. */
export function firstModelOf(index: ModelIndex): Undef<ConversationModel> {
  for (const provider of index.providers) {
    const model = provider.models[0]
    if (model !== undefined) return { providerId: provider.id, modelId: model.id }
  }
  return undefined
}

/**
 * What a new conversation starts on: the choice when there is one, and the first model there is
 * otherwise. One rule with two callers — the runtime that builds the model collection, and the
 * composer's chip, which has to name a model before any conversation exists.
 */
export function effectiveModelOf(index: ModelIndex): Undef<ConversationModel> {
  return defaultModelOf(index) ?? firstModelOf(index)
}

/**
 * What a conversation will actually run on: the model it chose while a provider still serves it,
 * and the effective default otherwise — a provider that was deleted, or a model that was renamed,
 * must not leave a conversation looking like it has nothing to run on. The main process reaches the
 * same conclusion from its own registry (`modelFor`); this is the window's copy of the rule, and it
 * exists because the window is the thing that has to name the model it is showing.
 */
export function modelIn(index: ModelIndex, chosen: Undef<ConversationModel>): Undef<ConversationModel> {
  if (chosen !== undefined && servesModel(index, chosen)) return chosen
  return effectiveModelOf(index)
}

/**
 * The definition behind a model reference: what the window needs to say a model's own name and to
 * ask what it can be handed. Nothing is invented for a model the index does not serve.
 */
export function definitionOf(index: ModelIndex, chosen: Undef<ConversationModel>): Undef<ProviderModelDefinition> {
  if (chosen === undefined) return undefined
  const provider = index.providers.find((candidate) => candidate.id === chosen.providerId)
  return provider?.models.find((model) => model.id === chosen.modelId)
}

/**
 * Whether the index still serves this exact model — the one guard every writer checks before it
 * writes a choice and every reader checks before it trusts one. Main asks it of its own store
 * through the same function, so there is one rule and two callers.
 */
export function servesModel(index: ModelIndex, chosen: ConversationModel): boolean {
  const provider = index.providers.find((candidate) => candidate.id === chosen.providerId)
  return provider?.models.some((model) => model.id === chosen.modelId) === true
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
