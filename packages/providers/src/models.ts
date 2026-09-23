/**
 * Which model a conversation runs on, in Alpha's terms rather than the agent's.
 *
 * Alpha owns the provider list and the credentials; the agent is told what to use. So everything
 * here reads Alpha's own store — and the rule that reads it lives in `@alpha/domain`, over a ModelIndex this
 * store hands out: what the person configured, which of it a conversation chose, and whether that
 * choice is still one Alpha can serve.
 */

import type { ModelStatus } from '@alpha/contract'
import { type ConversationModel, definitionOf, type ModelIndex, modelIn, type Undef } from '@alpha/domain'
import type { ProviderStore } from './store.ts'

/**
 * Which model a conversation runs on: the one it chose, when that provider still serves it, and
 * the configured default otherwise — a provider that was deleted must not leave a conversation
 * unusable.
 */
export function modelFor(store: ProviderStore, conversation: { model?: ConversationModel }): Undef<ConversationModel> {
  return modelIn(store.index(), conversation.model)
}

/** Where a new conversation starts: the model the person chose as the default. */
export const defaultModel = (store: ProviderStore): Undef<ConversationModel> => store.effectiveModel()

/**
 * Which case the agent is in, without dialling anything. Main stops here: the interface owns the
 * sentence that goes with the case, because the interface is the thing that has a language.
 */
export function describeRuntime(store: ProviderStore): ModelStatus {
  return defaultModel(store) === undefined ? { kind: 'none' } : { kind: 'configured' }
}

/** The sentence for a conversation whose model is gone, in the style of the other refusals. */
const NO_MODEL_REFUSAL = 'No model is configured for this conversation. Choose one under Settings, Models.'

/**
 * Why a turn may not start, said before anyone waits for one: no model to dial, a key that cannot
 * be read, or a picture a model that cannot read one would be handed. Absent means the turn may
 * start. The refusals come before the run rather than failing it at its first token (#114,
 * ADR-0018).
 */
export function startProblem(input: {
  index: ModelIndex
  /** Why the key cannot be dialled with, in the person's terms rather than the vault's. */
  keyProblem: (providerId: string) => Undef<string>
  model?: ConversationModel
  /** How many pictures are attached to the message about to be sent. */
  pictures: number
}): Undef<string> {
  const chosen = modelIn(input.index, input.model)
  if (chosen === undefined) return NO_MODEL_REFUSAL
  const problem = input.keyProblem(chosen.providerId)
  if (problem !== undefined) return problem
  if (input.pictures > 0 && refusesModelIndex(input.index, chosen)) {
    return `${chosen.modelId} does not take pictures. Turn that on for it under Settings, Models.`
  }
  return undefined
}

function refusesModelIndex(index: ModelIndex, chosen: ConversationModel): boolean {
  const definition = definitionOf(index, chosen)
  return definition !== undefined && definition.images !== true
}
