/**
 * The bridge. The renderer gets these functions and nothing else — no `ipcRenderer`, no channel
 * strings it could invent, no Node.
 */

import {
  type AlphaBridge,
  IPC,
  type LaunchState,
  type PermissionLevel,
  type PickWorkspaceResult,
  WINDOW_COMMAND_CHANNELS,
  type WindowCommand,
  type WindowState,
} from '@alpha/core'
import { contextBridge, ipcRenderer } from 'electron'

const bridge: AlphaBridge = {
  launchState: () => ipcRenderer.invoke(IPC.launchState) as Promise<LaunchState>,
  pickWorkspace: () => ipcRenderer.invoke(IPC.pickWorkspace) as Promise<PickWorkspaceResult>,
  selectWorkspace: (path: string) => ipcRenderer.invoke(IPC.selectWorkspace, path) as Promise<LaunchState>,
  setPermissionLevel: (level: PermissionLevel) =>
    ipcRenderer.invoke(IPC.setPermissionLevel, level) as Promise<LaunchState>,
  sendWindowCommand: (command: WindowCommand) => ipcRenderer.invoke(WINDOW_COMMAND_CHANNELS[command]) as Promise<void>,
  onWindowState: (listener: (state: WindowState) => void) => {
    const handler = (_event: unknown, state: WindowState) => listener(state)
    ipcRenderer.on(IPC.windowStateChanged, handler)
    return () => ipcRenderer.removeListener(IPC.windowStateChanged, handler)
  },
}

contextBridge.exposeInMainWorld('alpha', bridge)
