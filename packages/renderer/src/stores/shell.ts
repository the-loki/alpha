import {
  DEFAULT_LEVEL,
  emptyWorkspaceState,
  type LaunchState,
  type PermissionLevel,
  type Theme,
  type WorkspaceRef,
  type WorkspaceSelection,
} from '@alpha/core'
import { create } from 'zustand'
import { bridge, type ClientHost, clientHost } from '../lib/bridge.ts'
import { Unauthorized, unlock as unlockTransport, watchRefusals } from '../lib/network-bridge.ts'

export interface ShellStore {
  ready: boolean
  appVersion: string
  platform: string
  workspace: WorkspaceSelection
  recents: WorkspaceRef[]
  permissionLevel: PermissionLevel
  /** What this workspace's new conversations start at. */
  workspaceLevel: PermissionLevel
  theme: Theme
  model: LaunchState['model']
  /** The conversation to come back to on launch, empty when there is none. */
  lastConversationId: string
  windowMaximized: boolean
  /** Which process draws this workbench: the window chrome and the folder picker differ. */
  host: ClientHost
  /** A browser with no session: the workbench is not reachable until the token is given. */
  locked: boolean
  unlock: (token: string) => Promise<void>
  load: () => Promise<void>
  pickWorkspace: () => Promise<void>
  openRecent: (path: string) => Promise<void>
  setPermissionLevel: (level: PermissionLevel) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  setWindowMaximized: (maximized: boolean) => void
  /** Spends the memory of the last conversation: it is for one launch, not for every visit to / */
  clearResume: () => void
}

const applyLaunchState = (state: LaunchState) => ({
  ready: true,
  appVersion: state.appVersion,
  platform: state.platform,
  workspace: state.workspace,
  recents: state.recents,
  permissionLevel: state.permissionLevel,
  workspaceLevel: state.workspaceLevel,
  theme: state.theme,
  model: state.model,
  lastConversationId: state.lastConversationId,
})

/** System is the absence of the attribute: the stylesheet's `prefers-color-scheme` decides. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/** Where the desktop offers a native folder dialog, a browser has nothing to offer instead. */
export const NO_FOLDER_PICKER = 'A folder can only be opened in the desktop app.'

export const useShell = create<ShellStore>((set, get) => ({
  ready: false,
  appVersion: '',
  platform: '',
  workspace: emptyWorkspaceState().selection,
  recents: [],
  permissionLevel: DEFAULT_LEVEL,
  workspaceLevel: DEFAULT_LEVEL,
  theme: 'system',
  model: { configured: false, description: '' },
  lastConversationId: '',
  windowMaximized: false,
  host: 'desktop',
  locked: false,

  load: async () => {
    // A refusal is not a failure to report: it means this browser has no session yet, and the
    // screen it needs is the one that asks for the token.
    try {
      const state = await bridge().launchState()
      applyTheme(state.theme)
      set({ ...applyLaunchState(state), host: clientHost(), locked: false })
    } catch (failure) {
      if (!(failure instanceof Unauthorized)) throw failure
      set({ locked: true, ready: true, host: clientHost() })
    }
  },

  unlock: async (token: string) => {
    await unlockTransport(token)
    await get().load()
  },

  pickWorkspace: async () => {
    const result = await bridge().pickWorkspace()
    if (result.canceled) return
    await get().load()
  },

  openRecent: async (path: string) => {
    set(applyLaunchState(await bridge().selectWorkspace(path)))
  },

  setPermissionLevel: async (level: PermissionLevel) => {
    set(applyLaunchState(await bridge().setPermissionLevel(level)))
  },

  setTheme: async (theme: Theme) => {
    const state = await bridge().setTheme(theme)
    applyTheme(state.theme)
    set(applyLaunchState(state))
  },

  setWindowMaximized: (maximized: boolean) => set({ windowMaximized: maximized }),

  clearResume: () => set({ lastConversationId: '' }),
}))

// Once per page, wherever the refusal was noticed: a session that is gone takes the whole
// workbench with it, because every screen behind it would only be refused in turn.
watchRefusals(() => useShell.setState({ locked: true }))
