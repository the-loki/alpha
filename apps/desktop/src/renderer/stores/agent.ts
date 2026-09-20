import type { AgentSnapshot, Undef } from '@alpha/core'
import { createStore } from 'solid-js/store'
import { bridge } from '../lib/bridge.ts'

interface AgentState {
  /** Nothing until main has answered: "missing" before the search would be a guess. */
  snapshot: Undef<AgentSnapshot>
}

/**
 * The agent Alpha runs, as the window knows it. One store rather than each surface asking for
 * itself, because the settings panel and the composer must never disagree about whether there is
 * anything to send to.
 */
const [agent, setAgent] = createStore<AgentState>({ snapshot: undefined })

export { agent }

export const agentActions = {
  apply: (snapshot: AgentSnapshot): void => {
    setAgent('snapshot', snapshot)
  },

  /** Asks again, which is what "look again" and a fresh window both do. */
  refresh: async (): Promise<void> => {
    setAgent('snapshot', await bridge().agentSnapshot())
  },

  setPath: async (path: string): Promise<void> => {
    setAgent('snapshot', await bridge().setAgentPath(path))
  },

  install: async (): Promise<void> => {
    setAgent('snapshot', await bridge().installAgent())
  },
}

/** Whether the window has anything to send to yet. */
export const agentReady = (snapshot: Undef<AgentSnapshot>): boolean => snapshot?.status.kind === 'ready'
