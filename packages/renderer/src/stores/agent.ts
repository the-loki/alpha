import type { AgentSnapshot, Undef } from '@alpha/core'
import { create } from 'zustand'
import { bridge } from '../lib/bridge.ts'

/**
 * The agent Alpha runs, as the window knows it: whether there is one, where Alpha looked, and
 * what an install is doing. One store rather than each surface asking for itself, because the
 * settings panel and the composer must never disagree about whether there is anything to send to.
 */
interface AgentStore {
  /** Nothing until main has answered: "missing" before the search would be a guess. */
  snapshot: Undef<AgentSnapshot>
  apply: (snapshot: AgentSnapshot) => void
  /** Asks again, which is what "look again" and a fresh window both do. */
  refresh: () => Promise<void>
  setPath: (path: string) => Promise<void>
  install: () => Promise<void>
}

export const useAgent = create<AgentStore>((set) => ({
  snapshot: undefined,

  apply: (snapshot) => set({ snapshot }),

  refresh: async () => set({ snapshot: await bridge().agentSnapshot() }),

  setPath: async (path) => set({ snapshot: await bridge().setAgentPath(path) }),

  install: async () => set({ snapshot: await bridge().installAgent() }),
}))

/** Whether the window has anything to send to yet. */
export const agentReady = (snapshot: Undef<AgentSnapshot>): boolean => snapshot?.status.kind === 'ready'
