/**
 * Which model a conversation runs on, in Alpha's terms rather than the agent's.
 *
 * Alpha owns the provider list and the credentials; the agent is told what to use. So everything
 * here reads Alpha's own store — and the rule that reads it lives in `@alpha/domain`, over a ModelIndex this
 * store hands out: what the person configured, which of it a conversation chose, and whether that
 * choice is still one Alpha can serve.
 */

import type { ModelStatus } from '@alpha/contract'
import {
  type ConversationModel,
  definitionOf,
  type ModelIndex,
  modelIn,
  type TurnRefusal,
  type Undef,
} from '@alpha/domain'
import type { ProviderStore } from './store.ts'

/** The conversation's chosen model, only when its provider still serves that exact model. */
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

/**
 * Why a turn may not start, said before anyone waits for one: no model to dial, a key that cannot
 * be read, or a picture a model that cannot read one would be handed. Absent means the turn may
 * start. Each is a case rather than a sentence, because the words belong to the window and this is
 * not the thing with a language (ADR-0010). The refusals come before the run rather than failing it
 * at its first token (#114, ADR-0018).
 */
export function startProblem(input: {
  index: ModelIndex
  /** Which key refusal it is, named for the person rather than the vault. */
  keyProblem: (providerId: string) => Undef<TurnRefusal>
  model?: ConversationModel
  /** How many pictures are attached to the message about to be sent. */
  pictures: number
}): Undef<TurnRefusal> {
  const requested = input.model
  if (requested === undefined) return { kind: 'no-model' }
  if (!input.index.providers.some((provider) => provider.id === requested.providerId)) {
    return { kind: 'no-provider', providerId: requested.providerId }
  }
  const chosen = modelIn(input.index, requested)
  if (chosen === undefined) {
    return { kind: 'model-not-served', providerId: requested.providerId, modelId: requested.modelId }
  }
  const problem = input.keyProblem(chosen.providerId)
  if (problem !== undefined) return problem
  const definition = definitionOf(input.index, chosen)
  // The model is named the way the person named it, because that is the name they wrote.
  if (input.pictures > 0 && definition !== undefined && definition.images !== true) {
    return { kind: 'pictures', model: definition.name }
  }
  return undefined
}
