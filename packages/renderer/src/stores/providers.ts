import type { DefaultModelInput, ProviderInput, ProviderModelInput, ProvidersSnapshotMessage } from '@alpha/core'
import { create } from 'zustand'
import { bridge } from '../lib/bridge.ts'

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
