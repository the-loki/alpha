/**
 * The one place cross-process traffic is declared. The renderer reaches the main process only
 * through these channels, the preload exposes exactly these, and the main process registers a
 * handler for each. `pnpm check:constraints` is what keeps the three in step.
 */

import type { PermissionLevel } from './permission.ts'
import type { ChatMessage, ConversationSummary, RuntimeEvent } from './runtime-events.ts'
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
  listConversations: 'alpha:list-conversations',
  createConversation: 'alpha:create-conversation',
  openConversation: 'alpha:open-conversation',
  sendPrompt: 'alpha:send-prompt',
  abortRun: 'alpha:abort-run',
  runtimeEvent: 'alpha:runtime-event',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface ModelStatus {
  configured: boolean
  /** What the runtime will talk to, or why it cannot talk to anything yet. */
  description: string
}

export interface LaunchState {
  appVersion: string
  platform: string
  workspace: WorkspaceSelection
  recents: WorkspaceRef[]
  permissionLevel: PermissionLevel
  model: ModelStatus
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

export interface OpenedConversation {
  conversation: ConversationSummary
  messages: ChatMessage[]
}

/** The surface the preload puts on `window.alpha`, and the only way the renderer acts. */
export interface AlphaBridge {
  launchState(): Promise<LaunchState>
  pickWorkspace(): Promise<PickWorkspaceResult>
  selectWorkspace(path: string): Promise<LaunchState>
  setPermissionLevel(level: PermissionLevel): Promise<LaunchState>
  sendWindowCommand(command: WindowCommand): Promise<void>
  onWindowState(listener: (state: WindowState) => void): () => void

  listConversations(): Promise<ConversationSummary[]>
  createConversation(workspacePath: string): Promise<OpenedConversation>
  openConversation(id: string): Promise<OpenedConversation>
  sendPrompt(conversationId: string, text: string): Promise<void>
  abortRun(conversationId: string): Promise<void>
  /** Events arrive as they happen; the returned function stops listening. */
  onRuntimeEvent(listener: (event: RuntimeEvent) => void): () => void
}
