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
import { create } from 'zustand'
import { bridge } from '../lib/bridge.ts'
import { useConversations } from './conversations.ts'

export interface ProviderTestOutcome {
  ok: boolean
  message: string
}

export interface ProvidersStore {
  snapshot: ProvidersSnapshotMessage
  load: () => Promise<void>
  save: (input: ProviderInput) => Promise<void>
  saveModels: (id: string, models: ProviderModelInput[]) => Promise<void>
  setDefaultModel: (chosen: DefaultModelInput) => Promise<void>
  remove: (id: string) => Promise<void>
  setCredential: (id: string, secret: string) => Promise<void>
  test: (id: string, modelId: string) => Promise<ProviderTestOutcome>
}

const emptySnapshot: ProvidersSnapshotMessage = { providers: [], protection: 'os' }

/**
 * One rule for every change: the main process answers with the whole snapshot, so the window keeps
 * one state and never has to ask again after an edit.
 */
export const useProviders = create<ProvidersStore>((set) => ({
  snapshot: emptySnapshot,

  load: async () => set({ snapshot: await bridge().providers() }),

  save: async (input) => set({ snapshot: await bridge().saveProvider(input) }),

  saveModels: async (id, models) => set({ snapshot: await bridge().saveProviderModels(id, models) }),

  setDefaultModel: async (chosen) => set({ snapshot: await bridge().setDefaultModel(chosen) }),

  remove: async (id) => set({ snapshot: await bridge().removeProvider(id) }),

  setCredential: async (id, secret) => set({ snapshot: await bridge().setCredential(id, secret) }),

  test: async (id, modelId) => bridge().testProvider(id, modelId),
}))

/** What a message typed now would run on, as far as the window can tell. */
export interface RunningModel {
  /** Which model it is, by provider and id: what a menu marks as the current one. */
  chosen: Undef<ConversationModel>
  /** The model's own definition, when the window's provider list serves it. */
  definition: Undef<ProviderModelDefinition>
  /** What to call it: its own name, or nothing when the window has never heard of it. */
  name: Undef<string>
  /**
   * Whether it may be handed a picture. Unknown reads as yes, because the window only refuses what
   * it knows is impossible — with no provider list in front of it (the scripted runtime, a
   * conversation whose provider was deleted before the list arrived) the main process is the one
   * that decides, and it refuses there (ADR-0018).
   */
  takesPictures: boolean
}

/**
 * The model the next message runs on: with a conversation open it is that conversation's own,
 * falling back to the default when it no longer resolves, and with none open it is what a new
 * conversation would start on. One rule with three readers — the composer's chip, the composer's
 * paperclip, and anything that has to name the model — so they cannot disagree about it.
 */
export function useRunningModel(): RunningModel {
  const snapshot = useProviders((state) => state.snapshot)
  const summary = useConversations((state) => state.transcript.summary)
  const chosen: Undef<ConversationModel> =
    summary !== undefined && summary.model.providerId !== '' ? summary.model : undefined
  const resolved = modelIn(snapshot, chosen)
  const definition = definitionOf(snapshot, resolved)
  return {
    chosen: resolved,
    definition,
    name: definition?.name,
    takesPictures: definition === undefined || definition.images,
  }
}
