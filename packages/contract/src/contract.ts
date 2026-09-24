/**
 * The one place cross-process traffic is declared. The renderer reaches the main process only
 * through these channels, the preload exposes exactly these, and the main process registers a
 * handler for each. `pnpm check:constraints` is what keeps the three in step.
 */

import type {
  Attachment,
  ChatMessage,
  ConversationModel,
  ConversationSummary,
  McpElicitationAnswer,
  McpElicitationRequest,
  McpExchange,
  McpServerDefinition,
  NetworkBind,
  PermissionLevel,
  PermissionRule,
  ProviderInput,
  ProviderModelDefinition,
  ProviderView,
  RuleScope,
  RuntimeEvent,
  ScheduledTask,
  TasksSnapshot,
  Theme,
  ThinkingLevel,
  TurnRefusal,
  Undef,
  UsageTotals,
  WorkspaceChangeSet,
  WorkspaceRef,
  WorkspaceSelection,
} from '@alpha/domain'
import type { LanguageSetting } from '@alpha/i18n'

/** A model as the models panel sends it — the same shape it is stored as. */
export type ProviderModelInput = ProviderModelDefinition

/** An MCP server as the settings page sends it, which is the shape it is written down in. */
export type McpServerInput = McpServerDefinition

/** How a server went: what is known of it before it is reached, what it offers, or why not. */
export type McpReached =
  | { state: 'starting' }
  | { state: 'connected'; tools: number }
  | { state: 'unreachable'; problem: string }

/** A server as the settings page shows it: how it is reached, and how that went. */
export type McpServerView = McpServerDefinition & { reached: McpReached }

export interface McpSnapshotMessage {
  servers: McpServerView[]
}

/** Which model new conversations start on. Absent clears the choice, so the first model wins. */
export type DefaultModelInput = Undef<ConversationModel>

export const IPC = {
  launchState: 'alpha:launch-state',
  pickWorkspace: 'alpha:pick-workspace',
  selectWorkspace: 'alpha:select-workspace',
  setPermissionLevel: 'alpha:set-permission-level',
  setConversationLevel: 'alpha:set-conversation-level',
  setAppearance: 'alpha:set-appearance',
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
  saveProvider: 'alpha:save-provider',
  saveProviderModels: 'alpha:save-provider-models',
  setDefaultModel: 'alpha:set-default-model',
  removeProvider: 'alpha:remove-provider',
  testProvider: 'alpha:test-provider',
  setCredential: 'alpha:set-credential',
  setConversationModel: 'alpha:set-conversation-model',
  setThinkingLevel: 'alpha:set-thinking-level',
  steer: 'alpha:steer',
  queueMessage: 'alpha:queue-message',
  editQueued: 'alpha:edit-queued',
  resumeQueue: 'alpha:resume-queue',
  cancelQueued: 'alpha:cancel-queued',
  regenerate: 'alpha:regenerate',
  editMessage: 'alpha:edit-message',
  renameConversation: 'alpha:rename-conversation',
  archiveConversation: 'alpha:archive-conversation',
  unarchiveConversation: 'alpha:unarchive-conversation',
  deleteConversation: 'alpha:delete-conversation',
  exportConversation: 'alpha:export-conversation',
  listTasks: 'alpha:list-tasks',
  saveTask: 'alpha:save-task',
  deleteTask: 'alpha:delete-task',
  runTaskNow: 'alpha:run-task-now',
  permissionRules: 'alpha:permission-rules',
  revokePermissionRule: 'alpha:revoke-permission-rule',
  answerApproval: 'alpha:answer-approval',
  answerMcpElicitation: 'alpha:answer-mcp-elicitation',
  permissionRulesChanged: 'alpha:permission-rules-changed',
  tasksChanged: 'alpha:tasks-changed',
  networkState: 'alpha:network-state',
  setNetworkAccess: 'alpha:set-network-access',
  regenerateNetworkToken: 'alpha:regenerate-network-token',
  mcpServers: 'alpha:mcp-servers',
  saveMcpServer: 'alpha:save-mcp-server',
  removeMcpServer: 'alpha:remove-mcp-server',
  reconnectMcpServer: 'alpha:reconnect-mcp-server',
} as const

/**
 * Which model the runtime would talk to, as the window needs to know it — a case, not a sentence.
 * Main knows *what* is configured; how to say it is the interface's business, and a sentence
 * composed in main would be English in the middle of a Chinese window.
 */
export type ModelStatus = { kind: 'none' } | { kind: 'configured' }

export interface LaunchState {
  appVersion: string
  platform: string
  workspace: WorkspaceSelection
  recents: WorkspaceRef[]
  permissionLevel: PermissionLevel
  /** What this workspace's new conversations start at, which may differ from the general default. */
  workspaceLevel: PermissionLevel
  /** Per-folder defaults, so the window can say what a new conversation in a folder starts at. */
  workspaceLevels: Record<string, PermissionLevel>
  theme: Theme
  /** Which language this workbench's interface is written in. */
  language: LanguageSetting
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
  workspaceChanges: WorkspaceChangeSet[]
  mcpExchanges: McpExchange[]
  mcpPending: McpElicitationRequest[]
  /** What this conversation has spent, so a window opening it shows the same totals as before. */
  usage: UsageTotals
}

export interface ProvidersSnapshotMessage {
  providers: ProviderView[]
  protection: 'os' | 'plaintext'
  /** What new conversations start on: the choice below, or the first model there is. */
  defaultModel?: ConversationModel
  /** What the user chose for that, absent when they never chose one. */
  defaultModelChoice?: ConversationModel
}

/**
 * What one provider test answered: model text, a preflight refusal, or a failed request. Alpha's
 * own cases get their words in the window's language; external error text travels separately and
 * is quoted as it came (ADR-0010).
 */
export type ProviderTestFailure =
  | { kind: 'timeout'; seconds: number }
  | { kind: 'request-failed'; said?: string }
  | { kind: 'provider-error'; said: string }
  | { kind: 'empty-answer' }

export type ProviderTestOutcome =
  | { ok: true; said: string }
  | { ok: false; failure: ProviderTestFailure }
  | { ok: false; refusal: TurnRefusal }

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

/** How the workbench looks and reads, as a patch: the palette and the language. */
export interface AppearancePatch {
  theme?: Theme
  language?: LanguageSetting
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

export type McpElicitationAnswerInput = McpElicitationAnswer & {
  conversationId: string
  requestId: string
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
  setAppearance(patch: AppearancePatch): Promise<LaunchState>
  networkState(): Promise<NetworkState>
  setNetworkAccess(patch: NetworkPatch): Promise<NetworkState>
  regenerateNetworkToken(): Promise<NetworkState>
  /** The MCP servers this workbench is configured with, and how each of them went. */
  mcpServers(): Promise<McpSnapshotMessage>
  /** A server: what to call it, and one of the two ways to reach it. Answers with the whole list. */
  saveMcpServer(server: McpServerInput): Promise<McpSnapshotMessage>
  removeMcpServer(name: string): Promise<McpSnapshotMessage>
  /** Reaches one again, which is how a server that was down is picked back up without a restart. */
  reconnectMcpServer(name: string): Promise<McpSnapshotMessage>
  sendWindowCommand(command: WindowCommand): Promise<void>
  onWindowState(listener: (state: WindowState) => void): () => void

  listConversations(): Promise<ConversationSummary[]>
  createConversation(workspacePath: string): Promise<OpenedConversation>
  openConversation(id: string): Promise<OpenedConversation>
  /**
   * Starts a turn, and answers with why it did not start when it did not: nothing means it is
   * running. The refusal is also said to the conversation, as `turn_refused`, which is where the
   * window draws it — the case is answered here so a caller knows the turn never began.
   */
  sendPrompt(conversationId: string, text: string, attachments?: Attachment[]): Promise<Undef<TurnRefusal>>
  abortRun(conversationId: string): Promise<void>
  /** Events arrive as they happen; the returned function stops listening. */
  onRuntimeEvent(listener: (event: RuntimeEvent) => void): () => void

  providers(): Promise<ProvidersSnapshotMessage>
  /** A connection: protocol, base url, name. Its models are a separate call and a separate panel. */
  saveProvider(input: ProviderInput): Promise<ProvidersSnapshotMessage>
  saveProviderModels(id: string, models: ProviderModelInput[]): Promise<ProvidersSnapshotMessage>
  setDefaultModel(chosen: DefaultModelInput): Promise<ProvidersSnapshotMessage>
  removeProvider(id: string): Promise<ProvidersSnapshotMessage>
  testProvider(id: string, modelId: string): Promise<ProviderTestOutcome>
  /** The one direction a credential travels: towards the main process. */
  setCredential(id: string, secret: string): Promise<ProvidersSnapshotMessage>
  setConversationModel(id: string, providerId: string, modelId: string): Promise<ConversationSummary>
  setThinkingLevel(id: string, level: ThinkingLevel): Promise<ConversationSummary>
  /** A message for the running turn, or one queued behind it. */
  steer(conversationId: string, text: string): Promise<void>
  queueMessage(conversationId: string, text: string): Promise<void>
  /** Changing a message that has not been sent, without moving it in the queue. */
  editQueued(conversationId: string, entryId: string, text: string): Promise<void>
  /** Starting a stopped queue again, after a failed turn or a Stop. */
  resumeQueue(conversationId: string): Promise<void>
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
  /** Puts it away, or takes it back out; both answer with the list the sidebar should draw. */
  archiveConversation(id: string): Promise<ConversationSummary[]>
  unarchiveConversation(id: string): Promise<ConversationSummary[]>
  /** Removes the conversation and its transcript from disk. */
  deleteConversation(id: string): Promise<ConversationSummary[]>
  /** Writes a markdown file next to the workspace and answers with where it went. */
  exportConversation(id: string): Promise<{ path: string }>
  /** The scheduled tasks and the runs they remember, which is everything the task pages draw. */
  listTasks(): Promise<TasksSnapshot>
  saveTask(input: Partial<ScheduledTask>): Promise<TasksSnapshot>
  deleteTask(id: string): Promise<TasksSnapshot>
  /** Runs one now, with the person pressing it watching, so the gate may ask (ADR-0012). */
  runTaskNow(id: string): Promise<TasksSnapshot>
  permissionRules(): Promise<PermissionRule[]>
  revokePermissionRule(ruleId: string): Promise<PermissionRule[]>
  /** The one thing the renderer says about a card: the answer, and its scope when it is remembered. */
  answerApproval(answer: ApprovalAnswerInput): Promise<void>
  answerMcpElicitation(answer: McpElicitationAnswerInput): Promise<void>
  onPermissionRules(listener: (rules: PermissionRule[]) => void): () => void
  /** A task was added, edited or ran: the window redraws from what it is handed. */
  onTasks(listener: (snapshot: TasksSnapshot) => void): () => void
}
