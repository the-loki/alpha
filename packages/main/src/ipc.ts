/**
 * Every channel in the contract, and nothing else. Each handler validates what arrived before
 * it is trusted: the renderer is our own code, but it is also the process that could be
 * compromised, so the boundary is treated as a boundary.
 */

import {
  IPC,
  isPermissionLevel,
  type LaunchState,
  type PickWorkspaceResult,
  rememberWorkspace,
  WINDOW_COMMAND_CHANNELS,
  type WindowCommand,
  type WorkspaceSelection,
  workspaceFromPath,
} from '@alpha/core'
import { type BrowserWindow, dialog, ipcMain } from 'electron'
import type { StateStore } from './state-store.ts'

export function registerIpcHandlers(store: StateStore, getWindow: () => BrowserWindow): void {
  const launchState = (): LaunchState => ({
    appVersion: process.env.npm_package_version ?? '0.1.0',
    platform: process.platform,
    workspace: store.read().workspace.selection,
    recents: store.read().workspace.recents,
    permissionLevel: store.read().permissionLevel,
  })

  ipcMain.handle(IPC.launchState, launchState)

  ipcMain.handle(IPC.pickWorkspace, async (): Promise<PickWorkspaceResult> => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Open a folder as a workspace',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, workspace: store.read().workspace.selection }
    }
    return { canceled: false, workspace: selectWorkspace(result.filePaths[0]) }
  })

  ipcMain.handle(IPC.selectWorkspace, (_event, path: unknown): LaunchState => {
    if (typeof path === 'string' && path !== '') selectWorkspace(path)
    return launchState()
  })

  ipcMain.handle(IPC.setPermissionLevel, (_event, level: unknown): LaunchState => {
    if (typeof level === 'string' && isPermissionLevel(level)) {
      const state = store.read()
      store.write({ ...state, permissionLevel: level })
    }
    return launchState()
  })

  const windowCommands: Record<WindowCommand, () => void> = {
    minimize: () => getWindow()?.minimize(),
    'toggle-maximize': () => {
      const window = getWindow()
      if (!window) return
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    },
    close: () => getWindow()?.close(),
  }
  for (const [command, channel] of Object.entries(WINDOW_COMMAND_CHANNELS)) {
    ipcMain.handle(channel, () => windowCommands[command as WindowCommand]())
  }

  const selectWorkspace = (path: string): WorkspaceSelection => {
    const state = store.read()
    const next = rememberWorkspace(state.workspace, workspaceFromPath(path, Date.now()))
    store.write({ ...state, workspace: next })
    return next.selection
  }
}
