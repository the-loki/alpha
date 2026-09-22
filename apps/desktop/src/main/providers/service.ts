/**
 * What the settings screen is allowed to do with providers: store them, name their models, keep
 * their keys, say which one a new conversation runs on, and — when the person asks — find out
 * whether one answers. The last of those is asked of the model runtime itself (ADR-0025): the
 * same createModelRuntime a conversation dials, one trivial turn, so what is tested is the path a
 * turn takes and not a second implementation of it that could disagree.
 *
 * The service never returns a credential. It can say whether one is stored, and it can replace
 * or delete one (docs/constraints/02-architecture.md C2.4). The vault is read at request time and
 * no secret leaves the process.
 *
 * Two panels, two jobs: a provider is a connection (protocol, base url, key), and a model is a name
 * that connection serves with the limits that go with it. Every change answers with the whole
 * snapshot, so the window keeps one state instead of making a call after each edit.
 */

import {
  type ConversationModel,
  credentialRequirement,
  type ProviderModelDefinition,
  type ProviderView,
  readModels,
  readProvider,
  type StoredProvider,
  type Undef,
} from '@alpha/core'
import type { Api, AssistantMessage, Context, Model, Models, TextContent } from '@earendil-works/pi-ai'
import { createModelRuntime } from '../runtime/model-runtime.ts'
import type { ProviderStore } from './store.ts'

export interface ProvidersSnapshot {
  providers: ProviderView[]
  /** 'plaintext' means the OS gave us no keychain and the UI must say so. */
  protection: 'os' | 'plaintext'
  /** What a new conversation starts on: the choice below, or the first model there is. */
  defaultModel?: ConversationModel
  /** The model the user chose for that, absent when they never chose one. */
  defaultModelChoice?: ConversationModel
}

export interface ProviderTestResult {
  ok: boolean
  /** Either what the model answered or why it could not be reached, never a generic failure. */
  message: string
}

/** Long enough for a slow first token, short enough that the panel is not left hanging. */
const TEST_TIMEOUT_MS = 15_000

const TEST_PROMPT = 'Reply with the single word: ready'

export class ProviderService {
  readonly #store: ProviderStore
  /** Builds the runtime a test dials with; tests script one, the app builds the real thing. */
  readonly #models: Undef<() => Models>

  constructor(store: ProviderStore, options: { models?: () => Models } = {}) {
    this.#store = store
    this.#models = options.models
  }

  snapshot(): ProvidersSnapshot {
    return {
      providers: this.#store.views(),
      protection: this.#store.protection(),
      defaultModel: this.#store.effectiveModel(),
      defaultModelChoice: this.#store.chosenModel(),
    }
  }

  /** A new provider serves nothing yet: its models are added on the models panel. */
  save(input: unknown): ProvidersSnapshot {
    const result = readProvider(input)
    if (result.provider === undefined) throw new Error(result.error ?? 'the provider is not valid')
    const known = this.#store.find(result.provider.id)
    this.#store.save({ ...result.provider, models: known?.models ?? [] })
    return this.snapshot()
  }

  saveModels(id: string, input: unknown): ProvidersSnapshot {
    const result = readModels(input)
    if (result.models === undefined) throw new Error(result.error ?? 'the model list is not valid')
    this.#store.saveModels(id, result.models)
    return this.snapshot()
  }

  /** What new conversations start on. Absent hands the choice back to the first model found. */
  setDefaultModel(chosen: Undef<ConversationModel>): ProvidersSnapshot {
    if (chosen !== undefined) {
      const provider: Undef<StoredProvider> = this.#store.find(chosen.providerId)
      const serves = provider?.models.some((model: ProviderModelDefinition) => model.id === chosen.modelId)
      if (serves !== true) throw new Error(`${chosen.providerId} does not serve ${chosen.modelId}`)
    }
    this.#store.setDefaultModel(chosen)
    return this.snapshot()
  }

  remove(id: string): ProvidersSnapshot {
    this.#store.remove(id)
    return this.snapshot()
  }

  setCredential(id: string, secret: string): ProvidersSnapshot {
    if (this.#store.find(id) === undefined) throw new Error(`No provider ${id}`)
    this.#store.setCredential(id, secret)
    return this.snapshot()
  }

  /**
   * One real request, so a wrong key or a wrong base URL is caught here rather than mid-turn. The
   * refusals come before any dialing: no provider, no key, a model nobody serves — each a sentence
   * the panel can show.
   */
  async test(providerId: string, modelId: string): Promise<ProviderTestResult> {
    const provider = this.#store.find(providerId)
    if (provider === undefined) return { ok: false, message: `No provider ${providerId}` }
    if (!this.#store.hasCredential(providerId)) {
      return { ok: false, message: credentialRequirement({ hasCredential: false }).reason }
    }
    const problem = this.#store.keyProblem(providerId)
    if (problem !== undefined) return { ok: false, message: problem }
    const models = this.#models?.() ?? this.#modelRuntime(provider)
    const model = models.getModel(providerId, modelId)
    if (model === undefined) return { ok: false, message: `${providerId} does not serve ${modelId}.` }
    return askOnce(models, model)
  }

  /** The throwaway runtime for one test: this provider alone, its key read per request. */
  #modelRuntime(provider: StoredProvider): Models {
    return createModelRuntime({
      providers: [provider],
      credential: (id) => this.#store.credential(id),
    })
  }
}

/** One question, one answer: the shortest thing that proves a provider is reachable. */
async function askOnce(models: Models, model: Model<Api>): Promise<ProviderTestResult> {
  const question: Context = {
    messages: [{ role: 'user', content: TEST_PROMPT, timestamp: Date.now() }],
  }
  let timer: Undef<ReturnType<typeof setTimeout>>
  const timeout = new Promise<never>((_, stop) => {
    timer = setTimeout(
      () => stop(new Error(`The provider did not answer within ${TEST_TIMEOUT_MS / 1000} seconds.`)),
      TEST_TIMEOUT_MS,
    )
  })
  try {
    const answer = await Promise.race([models.completeSimple(model, question), timeout])
    return answerOf(answer)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The provider did not answer.' }
  } finally {
    clearTimeout(timer)
  }
}

/** What the provider said, or why it said nothing. */
function answerOf(answer: AssistantMessage): ProviderTestResult {
  if (answer.errorMessage !== undefined && answer.errorMessage !== '') {
    return { ok: false, message: `The provider did not answer: ${answer.errorMessage}` }
  }
  const said = answer.content
    .filter((part): part is TextContent => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .trim()
  return said === '' ? { ok: false, message: 'The provider answered with nothing.' } : { ok: true, message: said }
}
