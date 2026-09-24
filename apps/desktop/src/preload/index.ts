/**
 * The bridge. The renderer gets these functions and nothing else — no `ipcRenderer`, no channel
 * strings it could invent, no Node.
 */

import {
  type AlphaBridge,
  type AppearancePatch,
  type ApprovalAnswerInput,
  type DefaultModelInput,
  type EditEffect,
  IPC,
  type LaunchState,
  type McpElicitationAnswerInput,
  type McpSnapshotMessage,
  type NetworkPatch,
  type NetworkState,
  type OpenedConversation,
  type PickWorkspaceResult,
  type ProviderModelInput,
  type ProvidersSnapshotMessage,
  type ProviderTestOutcome,
  WINDOW_COMMAND_CHANNELS,
  type WindowCommand,
  type WindowState,
} from '@alpha/contract'
import type {
  Attachment,
  ConversationSummary,
  McpServerDefinition,
  PermissionLevel,
  PermissionRule,
  ProviderInput,
  RuntimeEvent,
  ScheduledTask,
  TasksSnapshot,
  ThinkingLevel,
  TurnRefusal,
  Undef,
} from '@alpha/domain'
import { contextBridge, ipcRenderer } from 'electron'

const bridge: AlphaBridge = {
  launchState: () => ipcRenderer.invoke(IPC.launchState) as Promise<LaunchState>,
  pickWorkspace: () => ipcRenderer.invoke(IPC.pickWorkspace) as Promise<PickWorkspaceResult>,
  selectWorkspace: (path: string) => ipcRenderer.invoke(IPC.selectWorkspace, path) as Promise<LaunchState>,
  setPermissionLevel: (level: PermissionLevel) =>
    ipcRenderer.invoke(IPC.setPermissionLevel, level) as Promise<LaunchState>,
  setAppearance: (patch: AppearancePatch) => ipcRenderer.invoke(IPC.setAppearance, patch) as Promise<LaunchState>,
  networkState: () => ipcRenderer.invoke(IPC.networkState) as Promise<NetworkState>,
  setNetworkAccess: (patch: NetworkPatch) => ipcRenderer.invoke(IPC.setNetworkAccess, patch) as Promise<NetworkState>,
  regenerateNetworkToken: () => ipcRenderer.invoke(IPC.regenerateNetworkToken) as Promise<NetworkState>,
  mcpServers: () => ipcRenderer.invoke(IPC.mcpServers) as Promise<McpSnapshotMessage>,
  saveMcpServer: (server: McpServerDefinition) =>
    ipcRenderer.invoke(IPC.saveMcpServer, server) as Promise<McpSnapshotMessage>,
  removeMcpServer: (name: string) => ipcRenderer.invoke(IPC.removeMcpServer, name) as Promise<McpSnapshotMessage>,
  reconnectMcpServer: (name: string) => ipcRenderer.invoke(IPC.reconnectMcpServer, name) as Promise<McpSnapshotMessage>,
  setConversationLevel: (id: string, level: PermissionLevel) =>
    ipcRenderer.invoke(IPC.setConversationLevel, id, level) as Promise<ConversationSummary>,
  sendWindowCommand: (command: WindowCommand) => ipcRenderer.invoke(WINDOW_COMMAND_CHANNELS[command]) as Promise<void>,
  testProvider: (id: string, modelId: string) =>
    ipcRenderer.invoke(IPC.testProvider, id, modelId) as Promise<ProviderTestOutcome>,
  onWindowState: (listener: (state: WindowState) => void) => {
    const handler = (_event: unknown, state: WindowState) => listener(state)
    ipcRenderer.on(IPC.windowStateChanged, handler)
    return () => ipcRenderer.removeListener(IPC.windowStateChanged, handler)
  },

  listConversations: () => ipcRenderer.invoke(IPC.listConversations) as Promise<OpenedConversation['conversation'][]>,
  createConversation: (workspacePath: string) =>
    ipcRenderer.invoke(IPC.createConversation, workspacePath) as Promise<OpenedConversation>,
  openConversation: (id: string) => ipcRenderer.invoke(IPC.openConversation, id) as Promise<OpenedConversation>,
  sendPrompt: (conversationId: string, text: string, attachments?: Attachment[]) =>
    ipcRenderer.invoke(IPC.sendPrompt, conversationId, text, attachments) as Promise<Undef<TurnRefusal>>,
  abortRun: (conversationId: string) => ipcRenderer.invoke(IPC.abortRun, conversationId) as Promise<void>,
  onRuntimeEvent: (listener: (event: RuntimeEvent) => void) => {
    const handler = (_event: unknown, runtimeEvent: RuntimeEvent) => listener(runtimeEvent)
    ipcRenderer.on(IPC.runtimeEvent, handler)
    return () => ipcRenderer.removeListener(IPC.runtimeEvent, handler)
  },

  providers: () => ipcRenderer.invoke(IPC.providersSnapshot) as Promise<ProvidersSnapshotMessage>,
  saveProvider: (input: ProviderInput) =>
    ipcRenderer.invoke(IPC.saveProvider, input) as Promise<ProvidersSnapshotMessage>,
  saveProviderModels: (id: string, models: ProviderModelInput[]) =>
    ipcRenderer.invoke(IPC.saveProviderModels, id, models) as Promise<ProvidersSnapshotMessage>,
  setDefaultModel: (chosen: DefaultModelInput) =>
    ipcRenderer.invoke(IPC.setDefaultModel, chosen) as Promise<ProvidersSnapshotMessage>,
  removeProvider: (id: string) => ipcRenderer.invoke(IPC.removeProvider, id) as Promise<ProvidersSnapshotMessage>,
  setCredential: (id: string, secret: string) =>
    ipcRenderer.invoke(IPC.setCredential, id, secret) as Promise<ProvidersSnapshotMessage>,
  setConversationModel: (id: string, providerId: string, modelId: string) =>
    ipcRenderer.invoke(IPC.setConversationModel, id, providerId, modelId) as Promise<ConversationSummary>,
  setThinkingLevel: (id: string, level: ThinkingLevel) =>
    ipcRenderer.invoke(IPC.setThinkingLevel, id, level) as Promise<ConversationSummary>,
  steer: (conversationId: string, text: string) => ipcRenderer.invoke(IPC.steer, conversationId, text) as Promise<void>,
  queueMessage: (conversationId: string, text: string) =>
    ipcRenderer.invoke(IPC.queueMessage, conversationId, text) as Promise<void>,
  editQueued: (conversationId: string, entryId: string, text: string) =>
    ipcRenderer.invoke(IPC.editQueued, conversationId, entryId, text) as Promise<void>,
  resumeQueue: (conversationId: string) => ipcRenderer.invoke(IPC.resumeQueue, conversationId) as Promise<void>,
  cancelQueued: (conversationId: string, entryId: string) =>
    ipcRenderer.invoke(IPC.cancelQueued, conversationId, entryId) as Promise<void>,
  regenerate: (conversationId: string) => ipcRenderer.invoke(IPC.regenerate, conversationId) as Promise<void>,
  editMessage: (conversationId: string, userMessageIndex: number, text: string, effect: EditEffect) =>
    ipcRenderer.invoke(IPC.editMessage, conversationId, userMessageIndex, text, effect) as Promise<OpenedConversation>,
  renameConversation: (id: string, title: string) =>
    ipcRenderer.invoke(IPC.renameConversation, id, title) as Promise<ConversationSummary>,
  archiveConversation: (id: string) =>
    ipcRenderer.invoke(IPC.archiveConversation, id) as Promise<ConversationSummary[]>,
  unarchiveConversation: (id: string) =>
    ipcRenderer.invoke(IPC.unarchiveConversation, id) as Promise<ConversationSummary[]>,
  deleteConversation: (id: string) => ipcRenderer.invoke(IPC.deleteConversation, id) as Promise<ConversationSummary[]>,
  exportConversation: (id: string) => ipcRenderer.invoke(IPC.exportConversation, id) as Promise<{ path: string }>,
  permissionRules: () => ipcRenderer.invoke(IPC.permissionRules) as Promise<PermissionRule[]>,
  revokePermissionRule: (ruleId: string) =>
    ipcRenderer.invoke(IPC.revokePermissionRule, ruleId) as Promise<PermissionRule[]>,
  answerApproval: (answer: ApprovalAnswerInput) => ipcRenderer.invoke(IPC.answerApproval, answer) as Promise<void>,
  answerMcpElicitation: (answer: McpElicitationAnswerInput) =>
    ipcRenderer.invoke(IPC.answerMcpElicitation, answer) as Promise<void>,
  listTasks: () => ipcRenderer.invoke(IPC.listTasks) as Promise<TasksSnapshot>,
  saveTask: (input: Partial<ScheduledTask>) => ipcRenderer.invoke(IPC.saveTask, input) as Promise<TasksSnapshot>,
  deleteTask: (id: string) => ipcRenderer.invoke(IPC.deleteTask, id) as Promise<TasksSnapshot>,
  runTaskNow: (id: string) => ipcRenderer.invoke(IPC.runTaskNow, id) as Promise<TasksSnapshot>,
  onTasks: (listener: (snapshot: TasksSnapshot) => void) => {
    const handler = (_event: unknown, snapshot: TasksSnapshot) => listener(snapshot)
    ipcRenderer.on(IPC.tasksChanged, handler)
    return () => ipcRenderer.removeListener(IPC.tasksChanged, handler)
  },
  onPermissionRules: (listener: (rules: PermissionRule[]) => void) => {
    const handler = (_event: unknown, rules: PermissionRule[]) => listener(rules)
    ipcRenderer.on(IPC.permissionRulesChanged, handler)
    return () => ipcRenderer.removeListener(IPC.permissionRulesChanged, handler)
  },
}

contextBridge.exposeInMainWorld('alpha', bridge)
