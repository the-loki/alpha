/**
 * What the settings screen is allowed to do with providers: store them, name their models, keep
 * their keys, say which one a new conversation runs on, and — when the person asks — find out
 * whether one answers. The last of those is asked of the model runtime itself (ADR-0025): the
 * same createModelRuntime a conversation dials, one trivial turn, so what is tested is the path a
 * turn takes and not a second implementation of it that could disagree.
 *
 * The service never returns a credential. It can say whether one is stored, and it can replace
 * or delete one (docs/constraints/02-architecture.md C2.4). The vault is read at request time;
 * no secret is returned to the window.
 *
 * One panel holds each provider connection (protocol, base URL, key) and the models it serves.
 * Every change answers with the whole snapshot, so the window keeps one state instead of making
 * a call after each edit.
 */

import type { ProvidersSnapshotMessage, ProviderTestOutcome } from '@alpha/contract'
import {
  type ConversationModel,
  readModels,
  readProvider,
  type StoredProvider,
  servesModel,
  type Undef,
} from '@alpha/domain'
import type { ProviderStore } from '@alpha/providers'
import type { Api, AssistantMessage, Context, Model, Models, TextContent } from '@earendil-works/pi-ai'
import { createModelRuntime } from '../runtime/model-runtime.ts'

/** What the service answers with: the contract's own snapshot, so the window reads one shape. */
export type ProvidersSnapshot = ProvidersSnapshotMessage

/** Long enough for a slow first token, short enough that the panel is not left hanging. */
const TEST_TIMEOUT_MS = 15_000

const TEST_PROMPT = 'Reply with the single word: ready'

export class ProviderService {
  private readonly store: ProviderStore
  /** Builds the runtime a test dials with; tests script one, the workbench builds the real thing. */
  private readonly models: Undef<() => Models>

  public constructor(store: ProviderStore, options: { models?: () => Models } = {}) {
    this.store = store
    this.models = options.models
  }

  public snapshot(): ProvidersSnapshot {
    return {
      providers: this.store.views(),
      protection: this.store.protection(),
      defaultModel: this.store.effectiveModel(),
      defaultModelChoice: this.store.chosenModel(),
    }
  }

  /** A new provider serves nothing yet: its models are added inside its own card. */
  public save(input: unknown): ProvidersSnapshot {
    const result = readProvider(input)
    if (result.provider === undefined) throw new Error(result.error ?? 'the provider is not valid')
    const known = this.store.find(result.provider.id)
    this.store.save({ ...result.provider, models: known?.models ?? [] })
    return this.snapshot()
  }

  public saveModels(id: string, input: unknown): ProvidersSnapshot {
    const result = readModels(input)
    if (result.models === undefined) throw new Error(result.error ?? 'the model list is not valid')
    this.store.saveModels(id, result.models)
    return this.snapshot()
  }

  /** What new conversations start on. Absent hands the choice back to the first model found. */
  public setDefaultModel(chosen: Undef<ConversationModel>): ProvidersSnapshot {
    if (chosen !== undefined && !servesModel(this.store.index(), chosen)) {
      throw new Error(`${chosen.providerId} does not serve ${chosen.modelId}`)
    }
    this.store.setDefaultModel(chosen)
    return this.snapshot()
  }

  public remove(id: string): ProvidersSnapshot {
    this.store.remove(id)
    return this.snapshot()
  }

  public setCredential(id: string, secret: string): ProvidersSnapshot {
    if (this.store.find(id) === undefined) throw new Error(`No provider ${id}`)
    this.store.setCredential(id, secret)
    return this.snapshot()
  }

  /**
   * One real request, so a wrong key or a wrong base URL is caught here rather than mid-turn. Alpha's
   * own refusals come before any dialing — no provider, no key, a model nobody serves — and each is a
   * case the panel has words for, in the panel's language (ADR-0010). What the provider itself says
   * is quoted as it came, which is why the two never travel in the same field.
   */
  public async test(providerId: string, modelId: string): Promise<ProviderTestOutcome> {
    const provider = this.store.find(providerId)
    if (provider === undefined) return { ok: false, refusal: { kind: 'no-provider', providerId } }
    // One question about the key: missing, unreadable, or there. Nothing is dialed without one.
    const problem = this.store.keyProblem(providerId)
    if (problem !== undefined) return { ok: false, refusal: problem }
    const models = this.models?.() ?? this.modelRuntime(provider)
    const model = models.getModel(providerId, modelId)
    if (model === undefined) return { ok: false, refusal: { kind: 'model-not-served', providerId, modelId } }
    return askOnce(models, model)
  }

  /** The throwaway runtime for one test: this provider alone, its key read per request. */
  private modelRuntime(provider: StoredProvider): Models {
    return createModelRuntime({
      providers: [provider],
      credential: (id) => this.store.credential(id),
    })
  }
}

/** One question, one answer: the shortest thing that proves a provider is reachable. */
async function askOnce(models: Models, model: Model<Api>): Promise<ProviderTestOutcome> {
  const question: Context = {
    messages: [{ role: 'user', content: TEST_PROMPT, timestamp: Date.now() }],
  }
  let timer: Undef<ReturnType<typeof setTimeout>>
  const timeoutError = new Error('Provider test timed out')
  const timeout = new Promise<never>((_, stop) => {
    timer = setTimeout(() => stop(timeoutError), TEST_TIMEOUT_MS)
  })
  try {
    const answer = await Promise.race([models.completeSimple(model, question), timeout])
    return answerOf(answer)
  } catch (error) {
    if (error === timeoutError) return { ok: false, failure: { kind: 'timeout', seconds: TEST_TIMEOUT_MS / 1000 } }
    return {
      ok: false,
      failure: {
        kind: 'request-failed',
        ...(error instanceof Error && error.message !== '' ? { said: error.message } : {}),
      },
    }
  } finally {
    clearTimeout(timer)
  }
}

/** What the provider said, or why it said nothing. */
function answerOf(answer: AssistantMessage): ProviderTestOutcome {
  if (answer.errorMessage !== undefined && answer.errorMessage !== '') {
    return { ok: false, failure: { kind: 'provider-error', said: answer.errorMessage } }
  }
  const said = answer.content
    .filter((part): part is TextContent => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .trim()
  return said === '' ? { ok: false, failure: { kind: 'empty-answer' } } : { ok: true, said }
}
