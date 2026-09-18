/**
 * The one place cross-process traffic is declared. The renderer reaches the main process only
 * through these channels, the preload exposes exactly these, and the main process registers a
 * handler for each. `pnpm check:constraints` is what keeps the three in step.
 */

import type { PermissionLevel, PermissionRule } from './permission.ts'
import type { ProviderModelDefinition, ProviderView } from './providers.ts'
import type { ChatMessage, ConversationSummary, RuntimeEvent } from './runtime-events.ts'
import type { ThinkingLevel } from './thinking.ts'

export interface CustomProviderInput {
  id: string
  name: string
  api: string
  baseUrl: string
  models: ProviderModelDefinition[]
}

import type { RuleScope } from './permission.ts'
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
  providersSnapshot: 'alpha:providers-snapshot',
  saveCatalogProvider: 'alpha:save-catalog-provider',
  saveCustomProvider: 'alpha:save-custom-provider',
  removeProvider: 'alpha:remove-provider',
  setCredential: 'alpha:set-credential',
  providerModels: 'alpha:provider-models',
  testProvider: 'alpha:test-provider',
  setConversationModel: 'alpha:set-conversation-model',
  setThinkingLevel: 'alpha:set-thinking-level',
  permissionRules: 'alpha:permission-rules',
  revokePermissionRule: 'alpha:revoke-permission-rule',
  answerApproval: 'alpha:answer-approval',
  permissionRulesChanged: 'alpha:permission-rules-changed',
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

export interface ProvidersSnapshotMessage {
  providers: ProviderView[]
  protection: 'os' | 'plaintext'
  catalog: { id: string; name: string; api: string; baseUrl: string; keyHint: string }[]
}

/** What the window answers a card with: allow this once, remember it, or refuse it. */
export interface ApprovalAnswerInput {
  conversationId: string
  requestId: string
  decision: 'once' | 'always' | 'deny'
  scope?: RuleScope
  reason?: string
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

  providers(): Promise<ProvidersSnapshotMessage>
  saveCatalogProvider(id: string): Promise<unknown>
  saveCustomProvider(input: CustomProviderInput): Promise<unknown>
  removeProvider(id: string): Promise<ProvidersSnapshotMessage>
  /** The one direction a credential travels: towards the main process. */
  setCredential(id: string, secret: string): Promise<ProvidersSnapshotMessage>
  providerModels(id: string): Promise<ProviderModelDefinition[]>
  testProvider(id: string, modelId: string): Promise<{ ok: boolean; message: string }>
  setConversationModel(id: string, providerId: string, modelId: string): Promise<ConversationSummary>
  setThinkingLevel(id: string, level: ThinkingLevel): Promise<ConversationSummary>
  permissionRules(): Promise<PermissionRule[]>
  revokePermissionRule(ruleId: string): Promise<PermissionRule[]>
  /** The one thing the renderer says about a card: the answer, and its scope when it is remembered. */
  answerApproval(answer: ApprovalAnswerInput): Promise<void>
  onPermissionRules(listener: (rules: PermissionRule[]) => void): () => void
}
