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
import { bridge } from '../lib/bridge.ts'

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

  load: async () => {
    const state = await bridge().launchState()
    applyTheme(state.theme)
    set(applyLaunchState(state))
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
