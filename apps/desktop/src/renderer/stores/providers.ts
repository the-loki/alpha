import type { DefaultModelInput, ProviderModelInput, ProvidersSnapshotMessage } from '@alpha/contract'
import type { ProviderInput } from '@alpha/domain'
import { createStore } from 'solid-js/store'
import { bridge } from '../lib/bridge.ts'

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
