/**
 * The one place cross-process traffic is declared. The renderer reaches the main process only
 * through these channels, the preload exposes exactly these, and the main process registers a
 * handler for each. `pnpm check:constraints` is what keeps the three in step.
 */
import type { PermissionLevel } from './permission.ts'
import type { WorkspaceRef, WorkspaceSelection } from './workspace.ts'

export const IPC = {
  launchState: 'alpha:launch-state',
  pickWorkspace: 'alpha:pick-workspace',
  selectWorkspace: 'alpha:select-workspace',
  setPermissionLevel: 'alpha:set-permission-level',
  windowMinimize: 'alpha:window-minimize',
  windowToggleMaximize: 'alpha:window-toggle-maximize',
  windowClose: 'alpha:window-close',
  windowStateChanged: 'alpha:window-state-changed',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface LaunchState {
  appVersion: string
  platform: string
  workspace: WorkspaceSelection
  recents: WorkspaceRef[]
  permissionLevel: PermissionLevel
}

export interface PickWorkspaceResult {
  canceled: boolean
  workspace: WorkspaceSelection
}

export interface WindowState {
  maximized: boolean
  fullScreen: boolean
}

export type WindowCommand = 'minimize' | 'toggle-maximize' | 'close'

export const WINDOW_COMMAND_CHANNELS = {
  minimize: IPC.windowMinimize,
  'toggle-maximize': IPC.windowToggleMaximize,
  close: IPC.windowClose,
} as const

/** The surface the preload puts on `window.alpha`, and the only way the renderer acts. */
export interface AlphaBridge {
  launchState(): Promise<LaunchState>
  pickWorkspace(): Promise<PickWorkspaceResult>
  selectWorkspace(path: string): Promise<LaunchState>
  setPermissionLevel(level: PermissionLevel): Promise<LaunchState>
  sendWindowCommand(command: WindowCommand): Promise<void>
  onWindowState(listener: (state: WindowState) => void): () => void
}
