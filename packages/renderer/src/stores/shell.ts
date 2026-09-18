import {
  DEFAULT_LEVEL,
  emptyWorkspaceState,
  type LaunchState,
  type PermissionLevel,
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
  windowMaximized: boolean
  load: () => Promise<void>
  pickWorkspace: () => Promise<void>
  openRecent: (path: string) => Promise<void>
  setPermissionLevel: (level: PermissionLevel) => Promise<void>
  setWindowMaximized: (maximized: boolean) => void
}

const applyLaunchState = (state: LaunchState) => ({
  ready: true,
  appVersion: state.appVersion,
  platform: state.platform,
  workspace: state.workspace,
  recents: state.recents,
  permissionLevel: state.permissionLevel,
})

export const useShell = create<ShellStore>((set, get) => ({
  ready: false,
  appVersion: '',
  platform: '',
  workspace: emptyWorkspaceState().selection,
  recents: [],
  permissionLevel: DEFAULT_LEVEL,
  windowMaximized: false,

  load: async () => set(applyLaunchState(await bridge().launchState())),

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

  setWindowMaximized: (maximized: boolean) => set({ windowMaximized: maximized }),
}))
