/**
 * The one place cross-process traffic is declared. The renderer reaches the main process only
 * through these channels, the preload exposes exactly these, and the main process registers a
 * handler for each. `pnpm check:constraints` is what keeps the three in step.
 */

import type { PermissionLevel, PermissionRule } from './permission.ts'
import type { NetworkBind, Theme } from './persisted-state.ts'
import type { ProviderModelDefinition, ProviderView } from './providers.ts'
import type { ChatMessage, ConversationSummary, RuntimeEvent } from './runtime-events.ts'
import type { ThinkingLevel } from './thinking.ts'
import type { UsageTotals } from './usage.ts'

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
  setConversationLevel: 'alpha:set-conversation-level',
  setTheme: 'alpha:set-theme',
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
  steer: 'alpha:steer',
  queueMessage: 'alpha:queue-message',
  cancelQueued: 'alpha:cancel-queued',
  regenerate: 'alpha:regenerate',
  editMessage: 'alpha:edit-message',
  renameConversation: 'alpha:rename-conversation',
  deleteConversation: 'alpha:delete-conversation',
  exportConversation: 'alpha:export-conversation',
  permissionRules: 'alpha:permission-rules',
  revokePermissionRule: 'alpha:revoke-permission-rule',
  answerApproval: 'alpha:answer-approval',
  permissionRulesChanged: 'alpha:permission-rules-changed',
  networkState: 'alpha:network-state',
  setNetworkAccess: 'alpha:set-network-access',
  regenerateNetworkToken: 'alpha:regenerate-network-token',
} as const

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
  /** What this workspace's new conversations start at, which may differ from the general default. */
  workspaceLevel: PermissionLevel
  theme: Theme
  model: ModelStatus
  /** The conversation that was open when the window last closed, or empty. */
  lastConversationId: string
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

/** Editing an answered message has to decide what happens to what followed it. */
export type EditEffect = 'replace' | 'fork'

export interface OpenedConversation {
  conversation: ConversationSummary
  messages: ChatMessage[]
  /** What this conversation has spent, so a window opening it shows the same totals as before. */
  usage: UsageTotals
}

export interface ProvidersSnapshotMessage {
  providers: ProviderView[]
  protection: 'os' | 'plaintext'
  catalog: { id: string; name: string; api: string; baseUrl: string; keyHint: string }[]
}

/** Browser access as the settings page shows it: what is stored, and what the server makes of it. */
export interface NetworkState {
  enabled: boolean
  port: number
  bind: NetworkBind
  /** The token a browser pastes. Empty until the switch has been on once. */
  token: string
  /** Where a browser on this machine, and on the network, should go. */
  urls: string[]
  /** Why it is not listening, when it is meant to be. */
  error: string
}

export interface NetworkPatch {
  enabled?: boolean
  port?: number
  bind?: NetworkBind
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
  /** The level new conversations in this workspace start at. */
  setPermissionLevel(level: PermissionLevel): Promise<LaunchState>
  /** The level in force for one conversation. */
  setConversationLevel(id: string, level: PermissionLevel): Promise<ConversationSummary>
  setTheme(theme: Theme): Promise<LaunchState>
  networkState(): Promise<NetworkState>
  setNetworkAccess(patch: NetworkPatch): Promise<NetworkState>
  regenerateNetworkToken(): Promise<NetworkState>
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
  /** A message for the running turn, or one queued behind it. */
  steer(conversationId: string, text: string): Promise<void>
  queueMessage(conversationId: string, text: string): Promise<void>
  cancelQueued(conversationId: string, entryId: string): Promise<void>
  regenerate(conversationId: string): Promise<void>
  /** What to do with the messages that came after the one being edited. */
  editMessage(
    conversationId: string,
    userMessageIndex: number,
    text: string,
    effect: EditEffect,
  ): Promise<OpenedConversation>
  renameConversation(id: string, title: string): Promise<ConversationSummary>
  /** Removes the conversation and its transcript from disk. */
  deleteConversation(id: string): Promise<ConversationSummary[]>
  /** Writes a markdown file next to the workspace and answers with where it went. */
  exportConversation(id: string): Promise<{ path: string }>
  permissionRules(): Promise<PermissionRule[]>
  revokePermissionRule(ruleId: string): Promise<PermissionRule[]>
  /** The one thing the renderer says about a card: the answer, and its scope when it is remembered. */
  answerApproval(answer: ApprovalAnswerInput): Promise<void>
  onPermissionRules(listener: (rules: PermissionRule[]) => void): () => void
}
