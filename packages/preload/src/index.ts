/**
 * The bridge. The renderer gets these functions and nothing else — no `ipcRenderer`, no channel
 * strings it could invent, no Node.
 */

import {
  type AlphaBridge,
  type ApprovalAnswerInput,
  type ConversationSummary,
  type CustomProviderInput,
  type EditEffect,
  IPC,
  type LaunchState,
  type OpenedConversation,
  type PermissionLevel,
  type PermissionRule,
  type PickWorkspaceResult,
  type ProviderModelDefinition,
  type ProvidersSnapshotMessage,
  type RuntimeEvent,
  type Theme,
  type ThinkingLevel,
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
  setTheme: (theme: Theme) => ipcRenderer.invoke(IPC.setTheme, theme) as Promise<LaunchState>,
  setConversationLevel: (id: string, level: PermissionLevel) =>
    ipcRenderer.invoke(IPC.setConversationLevel, id, level) as Promise<ConversationSummary>,
  sendWindowCommand: (command: WindowCommand) => ipcRenderer.invoke(WINDOW_COMMAND_CHANNELS[command]) as Promise<void>,
  onWindowState: (listener: (state: WindowState) => void) => {
    const handler = (_event: unknown, state: WindowState) => listener(state)
    ipcRenderer.on(IPC.windowStateChanged, handler)
    return () => ipcRenderer.removeListener(IPC.windowStateChanged, handler)
  },

  listConversations: () => ipcRenderer.invoke(IPC.listConversations) as Promise<OpenedConversation['conversation'][]>,
  createConversation: (workspacePath: string) =>
    ipcRenderer.invoke(IPC.createConversation, workspacePath) as Promise<OpenedConversation>,
  openConversation: (id: string) => ipcRenderer.invoke(IPC.openConversation, id) as Promise<OpenedConversation>,
  sendPrompt: (conversationId: string, text: string) =>
    ipcRenderer.invoke(IPC.sendPrompt, conversationId, text) as Promise<void>,
  abortRun: (conversationId: string) => ipcRenderer.invoke(IPC.abortRun, conversationId) as Promise<void>,
  onRuntimeEvent: (listener: (event: RuntimeEvent) => void) => {
    const handler = (_event: unknown, runtimeEvent: RuntimeEvent) => listener(runtimeEvent)
    ipcRenderer.on(IPC.runtimeEvent, handler)
    return () => ipcRenderer.removeListener(IPC.runtimeEvent, handler)
  },

  providers: () => ipcRenderer.invoke(IPC.providersSnapshot) as Promise<ProvidersSnapshotMessage>,
  saveCatalogProvider: (id: string) => ipcRenderer.invoke(IPC.saveCatalogProvider, id),
  saveCustomProvider: (input: CustomProviderInput) => ipcRenderer.invoke(IPC.saveCustomProvider, input),
  removeProvider: (id: string) => ipcRenderer.invoke(IPC.removeProvider, id) as Promise<ProvidersSnapshotMessage>,
  setCredential: (id: string, secret: string) =>
    ipcRenderer.invoke(IPC.setCredential, id, secret) as Promise<ProvidersSnapshotMessage>,
  providerModels: (id: string) => ipcRenderer.invoke(IPC.providerModels, id) as Promise<ProviderModelDefinition[]>,
  testProvider: (id: string, modelId: string) =>
    ipcRenderer.invoke(IPC.testProvider, id, modelId) as Promise<{ ok: boolean; message: string }>,
  setConversationModel: (id: string, providerId: string, modelId: string) =>
    ipcRenderer.invoke(IPC.setConversationModel, id, providerId, modelId) as Promise<ConversationSummary>,
  setThinkingLevel: (id: string, level: ThinkingLevel) =>
    ipcRenderer.invoke(IPC.setThinkingLevel, id, level) as Promise<ConversationSummary>,
  steer: (conversationId: string, text: string) => ipcRenderer.invoke(IPC.steer, conversationId, text) as Promise<void>,
  queueMessage: (conversationId: string, text: string) =>
    ipcRenderer.invoke(IPC.queueMessage, conversationId, text) as Promise<void>,
  cancelQueued: (conversationId: string, entryId: string) =>
    ipcRenderer.invoke(IPC.cancelQueued, conversationId, entryId) as Promise<void>,
  regenerate: (conversationId: string) => ipcRenderer.invoke(IPC.regenerate, conversationId) as Promise<void>,
  editMessage: (conversationId: string, userMessageIndex: number, text: string, effect: EditEffect) =>
    ipcRenderer.invoke(IPC.editMessage, conversationId, userMessageIndex, text, effect) as Promise<OpenedConversation>,
  renameConversation: (id: string, title: string) =>
    ipcRenderer.invoke(IPC.renameConversation, id, title) as Promise<ConversationSummary>,
  deleteConversation: (id: string) => ipcRenderer.invoke(IPC.deleteConversation, id) as Promise<ConversationSummary[]>,
  exportConversation: (id: string) => ipcRenderer.invoke(IPC.exportConversation, id) as Promise<{ path: string }>,
  permissionRules: () => ipcRenderer.invoke(IPC.permissionRules) as Promise<PermissionRule[]>,
  revokePermissionRule: (ruleId: string) =>
    ipcRenderer.invoke(IPC.revokePermissionRule, ruleId) as Promise<PermissionRule[]>,
  answerApproval: (answer: ApprovalAnswerInput) => ipcRenderer.invoke(IPC.answerApproval, answer) as Promise<void>,
  onPermissionRules: (listener: (rules: PermissionRule[]) => void) => {
    const handler = (_event: unknown, rules: PermissionRule[]) => listener(rules)
    ipcRenderer.on(IPC.permissionRulesChanged, handler)
    return () => ipcRenderer.removeListener(IPC.permissionRulesChanged, handler)
  },
}

contextBridge.exposeInMainWorld('alpha', bridge)
