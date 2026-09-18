/**
 * Every channel in the contract, and nothing else. Each handler validates what arrived before
 * it is trusted: the renderer is our own code, but it is also the process that could be
 * compromised, so the boundary is treated as a boundary.
 *
 * The handlers are registered in three groups — the window's own chrome, the workspace, and the
 * conversations — because each has its own reason to change.
 */
import {
  IPC,
  isPermissionLevel,
  type LaunchState,
  type OpenedConversation,
  type PickWorkspaceResult,
  type RuntimeEvent,
  rememberWorkspace,
  WINDOW_COMMAND_CHANNELS,
  type WindowCommand,
  type WorkspaceSelection,
  workspaceFromPath,
} from '@alpha/core'
import { type BrowserWindow, dialog, ipcMain } from 'electron'
import type { RuntimeManager } from './runtime/manager.ts'
import { describeModel } from './runtime/models.ts'
import type { StateStore } from './state-store.ts'

export interface IpcContext {
  store: StateStore
  runtime: RuntimeManager
  getWindow: () => BrowserWindow
}

export function registerIpcHandlers(context: IpcContext): void {
  registerWorkspaceHandlers(context)
  registerConversationHandlers(context)
  registerWindowHandlers(context)
}

function registerWorkspaceHandlers({ store, getWindow }: IpcContext): void {
  const launchState = (): LaunchState => ({
    appVersion: process.env.npm_package_version ?? '0.1.0',
    platform: process.platform,
    workspace: store.read().workspace.selection,
    recents: store.read().workspace.recents,
    permissionLevel: store.read().permissionLevel,
    model: describeModel(process.env),
  })

  const selectWorkspace = (path: string): WorkspaceSelection => {
    const state = store.read()
    const next = rememberWorkspace(state.workspace, workspaceFromPath(path, Date.now()))
    store.write({ ...state, workspace: next })
    return next.selection
  }

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
    if (isPermissionLevel(level)) store.write({ ...store.read(), permissionLevel: level })
    return launchState()
  })
}

function registerConversationHandlers({ runtime }: IpcContext): void {
  ipcMain.handle(IPC.listConversations, () => runtime.list())

  ipcMain.handle(IPC.createConversation, (_event, workspacePath: unknown): Promise<OpenedConversation> => {
    return runtime.create(requireString(workspacePath, 'workspacePath'))
  })

  ipcMain.handle(IPC.openConversation, (_event, id: unknown): Promise<OpenedConversation> => {
    return runtime.open(requireString(id, 'conversationId'))
  })

  ipcMain.handle(IPC.sendPrompt, async (_event, id: unknown, text: unknown) => {
    await runtime.prompt(requireString(id, 'conversationId'), requireString(text, 'text'))
  })

  ipcMain.handle(IPC.abortRun, async (_event, id: unknown) => {
    await runtime.abort(requireString(id, 'conversationId'))
  })
}

function registerWindowHandlers({ getWindow }: IpcContext): void {
  const commands: Record<WindowCommand, () => void> = {
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
    ipcMain.handle(channel, () => commands[command as WindowCommand]())
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${field} must be a non-empty string`)
  return value
}

/** Pushes one runtime event to the window, if there is one listening. */
export function runtimeEventSender(getWindow: () => BrowserWindow): (event: RuntimeEvent) => void {
  return (event) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC.runtimeEvent, event)
  }
}
