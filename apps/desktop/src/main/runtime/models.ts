/**
 * Which model a conversation runs on, in Alpha's terms rather than the agent's.
 *
 * Alpha owns the provider list and the credentials; the agent is told what to use. So everything
 * here reads Alpha's own store — and the rule that reads it lives in core, over a ModelIndex this
 * store hands out: what the person configured, which of it a conversation chose, and whether that
 * choice is still one Alpha can serve.
 */

import { type ConversationModel, definitionOf, modelIn, type ModelStatus, type Undef } from '@alpha/core'
import type { ProviderStore } from '../providers/store.ts'

/**
 * Which model a conversation runs on: the one it chose, when that provider still serves it, and
 * the configured default otherwise — a provider that was deleted must not leave a conversation
 * unusable.
 */
export function modelFor(store: ProviderStore, conversation: { model: ConversationModel }): Undef<ConversationModel> {
  return modelIn(store.index(), conversation.model)
}

/** Where a new conversation starts: the model the person chose as the default. */
export const defaultModel = (store: ProviderStore): Undef<ConversationModel> => store.effectiveModel()

/**
 * Whether Alpha knows this model will not take a picture. Alpha refuses on that, and on nothing
 * else: a model it has no record of is the agent's business now, and a workbench that guessed
 * would refuse pictures for a provider it simply has not been told about (ADR-0018).
 */
export function refusesPictures(store: ProviderStore, chosen: ConversationModel): boolean {
  const definition = definitionOf(store.index(), chosen)
  return definition !== undefined && definition.images !== true
}

/**
 * Which case the agent is in, without dialling anything. Main stops here: the interface owns the
 * sentence that goes with the case, because the interface is the thing that has a language.
 */
export function describeRuntime(store: ProviderStore): ModelStatus {
  return defaultModel(store) === undefined ? { kind: 'none' } : { kind: 'configured' }
}
