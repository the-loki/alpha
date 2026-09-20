import {
  type ConversationModel,
  type DefaultModelInput,
  definitionOf,
  modelIn,
  type ProviderInput,
  type ProviderModelDefinition,
  type ProviderModelInput,
  type ProvidersSnapshotMessage,
  type Undef,
} from '@alpha/core'
import { createStore } from 'solid-js/store'
import { bridge } from '../lib/bridge.ts'
import { conversations } from './conversations.ts'

export interface ProviderTestOutcome {
  ok: boolean
  message: string
}

export interface ProvidersState {
  snapshot: ProvidersSnapshotMessage
}

const emptySnapshot: ProvidersSnapshotMessage = { providers: [], protection: 'os' }

/**
 * One rule for every change: the main process answers with the whole snapshot, so the window keeps
 * one state and never has to ask again after an edit.
 */
const [providers, setProviders] = createStore<ProvidersState>({ snapshot: emptySnapshot })

export { providers }

export const providerActions = {
  load: async (): Promise<void> => {
    setProviders('snapshot', await bridge().providers())
  },

  save: async (input: ProviderInput): Promise<void> => {
    setProviders('snapshot', await bridge().saveProvider(input))
  },

  saveModels: async (id: string, models: ProviderModelInput[]): Promise<void> => {
    setProviders('snapshot', await bridge().saveProviderModels(id, models))
  },

  setDefaultModel: async (chosen: DefaultModelInput): Promise<void> => {
    setProviders('snapshot', await bridge().setDefaultModel(chosen))
  },

  remove: async (id: string): Promise<void> => {
    setProviders('snapshot', await bridge().removeProvider(id))
  },

  test: async (id: string, modelId: string): Promise<ProviderTestOutcome> => bridge().testProvider(id, modelId),

  setCredential: async (id: string, secret: string): Promise<void> => {
    setProviders('snapshot', await bridge().setCredential(id, secret))
  },
}

/** What a message typed now would run on, as far as the window can tell. */
export interface RunningModel {
  /** Which model it is, by provider and id: what a menu marks as the current one. */
  chosen: () => Undef<ConversationModel>
  /** The model's own definition, when the window's provider list serves it. */
  definition: () => Undef<ProviderModelDefinition>
  /** What to call it: its own name, or nothing when the window has never heard of it. */
  name: () => Undef<string>
  /**
   * Whether it may be handed a picture. Unknown reads as yes, because the window only refuses what
   * it knows is impossible — with no provider list in front of it (the scripted runtime, a
   * conversation whose provider was deleted before the list arrived) the main process is the one
   * that decides, and it refuses there (ADR-0018).
   */
  takesPictures: () => boolean
}

/**
 * The model the next message runs on: with a conversation open it is that conversation's own,
 * falling back to the default when it no longer resolves, and with none open it is what a new
 * conversation would start on. One rule with three readers — the composer's chip, the composer's
 * paperclip, and anything that has to name the model — so they cannot disagree about it.
 *
 * Every answer is a getter: it reads the stores where it is asked for, so a chip that names the
 * model follows a change to it without anything having to subscribe.
 */
export function runningModel(): RunningModel {
  const chosen = (): Undef<ConversationModel> => {
    const summary = conversations.transcript.summary
    return summary !== undefined && summary.model.providerId !== '' ? summary.model : undefined
  }
  const resolved = () => modelIn(providers.snapshot, chosen())
  const definition = () => definitionOf(providers.snapshot, resolved())
  return {
    chosen: resolved,
    definition,
    name: () => definition()?.name,
    takesPictures: () => {
      const found = definition()
      return found === undefined || found.images
    },
  }
}
