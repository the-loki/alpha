import type { McpServerInput, McpSnapshotMessage } from '@alpha/contract'
import { createStore } from 'solid-js/store'
import { bridge } from '../lib/bridge.ts'

export interface McpState {
  snapshot: McpSnapshotMessage
}

/**
 * The MCP servers the settings page edits. One rule, the same one the providers panel works by:
 * every change answers with the whole list, so the panel keeps one state and never has to ask
 * again after an edit — and a change made here is already in force in the main process when the
 * answer arrives (a save reaches the server, it does not merely record it).
 */
const [mcp, setMcp] = createStore<McpState>({ snapshot: { servers: [] } })

export { mcp }

export const mcpActions = {
  /**
   * The panel's own read. A server that is still being reached has no outcome yet, and the window
   * is not pushed MCP changes the way it is pushed rules and tasks — so while anything is still
   * being reached, the panel asks again rather than saying "reaching it" for the rest of its life.
   * Bounded by the hub's own patience with a server that never answers, after which every server
   * has been attempted and has an answer of its own.
   */
  load: async (): Promise<void> => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      setMcp('snapshot', await bridge().mcpServers())
      if (!mcp.snapshot.servers.some((server) => server.reached.state === 'starting')) return
      await new Promise((resume) => setTimeout(resume, 200))
    }
  },

  save: async (server: McpServerInput): Promise<void> => {
    setMcp('snapshot', await bridge().saveMcpServer(server))
  },

  remove: async (name: string): Promise<void> => {
    setMcp('snapshot', await bridge().removeMcpServer(name))
  },

  reconnect: async (name: string): Promise<void> => {
    setMcp('snapshot', await bridge().reconnectMcpServer(name))
  },
}
