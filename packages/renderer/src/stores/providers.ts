import type { CustomProviderInput, ProviderModelDefinition, ProvidersSnapshotMessage } from '@alpha/core'
import { create } from 'zustand'
import { bridge } from '../lib/bridge.ts'

export interface ProviderTestOutcome {
  ok: boolean
  message: string
}

export interface ProvidersStore {
  snapshot: ProvidersSnapshotMessage
  /** Models per provider, fetched once each: the catalog's list can be long. */
  models: Record<string, ProviderModelDefinition[]>
  load: () => Promise<void>
  addFromCatalog: (id: string) => Promise<void>
  addCustom: (input: CustomProviderInput) => Promise<void>
  remove: (id: string) => Promise<void>
  setCredential: (id: string, secret: string) => Promise<void>
  loadModels: (providerId: string) => Promise<ProviderModelDefinition[]>
  test: (id: string, modelId: string) => Promise<ProviderTestOutcome>
}

const emptySnapshot: ProvidersSnapshotMessage = { providers: [], protection: 'os', catalog: [] }

export const useProviders = create<ProvidersStore>((set, get) => ({
  snapshot: emptySnapshot,
  models: {},

  load: async () => set({ snapshot: await bridge().providers() }),

  addFromCatalog: async (id: string) => {
    await bridge().saveCatalogProvider(id)
    await get().load()
  },

  addCustom: async (input: CustomProviderInput) => {
    await bridge().saveCustomProvider(input)
    await get().load()
  },

  remove: async (id: string) => {
    set({ snapshot: await bridge().removeProvider(id) })
  },

  setCredential: async (id: string, secret: string) => {
    set({ snapshot: await bridge().setCredential(id, secret) })
  },

  loadModels: async (providerId: string) => {
    const models = await bridge().providerModels(providerId)
    set({ models: { ...get().models, [providerId]: models } })
    return models
  },

  test: async (id: string, modelId: string) => bridge().testProvider(id, modelId),
}))
