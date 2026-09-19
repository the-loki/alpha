/**
 * Every channel in the contract, and the handler behind it. A table rather than a row of
 * registrations, because there are two transports now: the Electron window registers these into
 * `ipcMain`, and the HTTP server dispatches the same table for browser clients. Neither knows
 * about the other, and both get the same answers from the same functions.
 *
 * Nothing here imports Electron. What a handler needs from the window — a native dialog, and the
 * chrome commands — arrives as a `WindowPort`, so the table can be driven in a test with a fake
 * runtime, and so a browser client is refused the folder picker by construction rather than by a
 * check someone has to remember.
 */
import {
  type AppearancePatch,
  type ApprovalAnswerInput,
  defaultLevelFor,
  type IPC,
  isAccent,
  isLanguageSetting,
  isNetworkBind,
  isPermissionLevel,
  isPortNumber,
  isRuleScope,
  isTheme,
  isThinkingLevel,
  type LaunchState,
  type NetworkPatch,
  type NetworkState,
  type PermissionLevel,
  type PickWorkspaceResult,
  rememberWorkspace,
  type Undef,
  type WorkspaceSelection,
  workspaceFromPath,
} from '@alpha/core'
import type { ProviderService } from './providers/service.ts'
import type { RuntimeManager } from './runtime/manager.ts'
import type { StateStore } from './state-store.ts'

/** The OS dialog and the window chrome, as much of it as a channel handler may ask for. */
export interface WindowPort {
  /** Opens the native folder picker; a client without one refuses instead of guessing. */
  pickFolder(): Promise<PickWorkspaceResult>
  minimize(): void
  toggleMaximize(): void
  close(): void
}

/**
 * A client with no machine under it: a browser. It has no folder to pick and no window to move, so
 * the picker refuses with something a person can act on, and the chrome commands do nothing.
 */
export const headlessWindowPort: WindowPort = {
  pickFolder: async () => {
    throw new Error('A folder can only be chosen in the desktop app. Pick one of the recent folders.')
  },
  minimize: () => undefined,
  toggleMaximize: () => undefined,
  close: () => undefined,
}

/**
 * Browser access as the channels see it: read it, change it, replace the token. The server's own
 * life cycle is not a channel's business, so this is as much of the service as they get.
 */
export interface NetworkPort {
  state(): NetworkState
  set(patch: NetworkPatch): Promise<NetworkState>
  regenerateToken(): Promise<NetworkState>
}

export interface ChannelPorts {
  store: StateStore
  runtime: RuntimeManager
  providers: ProviderService
  window: WindowPort
  network: NetworkPort
}

/** The arguments as they arrived from another process, before any handler has looked at them. */
export type ChannelArgs = readonly unknown[]

export type ChannelHandler = (ports: ChannelPorts, args: ChannelArgs) => unknown

/**
 * The channels main pushes to a client rather than answers: the runtime's events, the window's own
 * state, and a change to the remembered rules. They have no handler, and a client cannot call them.
 */
export const PUSHED_CHANNELS = ['runtimeEvent', 'windowStateChanged', 'permissionRulesChanged'] as const

type PushedChannel = (typeof PUSHED_CHANNELS)[number]
type NamedChannel = Exclude<keyof typeof IPC, PushedChannel>

/**
 * The table. Typed as a total map over the contract, so a channel added to the contract without a
 * handler is a compile error rather than a call that fails at the moment the user tries it.
 */
export const CHANNELS: Record<NamedChannel, ChannelHandler> = {
  launchState: ({ store, runtime }) => launchState(store, runtime),

  pickWorkspace: async ({ store, window }) => {
    const result = await window.pickFolder()
    if (result.canceled || result.workspace.kind !== 'selected') return result
    return { canceled: false, workspace: selectWorkspace(store, result.workspace.workspace.path) }
  },

  selectWorkspace: ({ store, runtime }, args) => {
    const path = args[0]
    if (typeof path === 'string' && path !== '') selectWorkspace(store, path)
    return launchState(store, runtime)
  },

  setPermissionLevel: ({ store, runtime }, args) => {
    if (isPermissionLevel(args[0])) setWorkspaceLevel(store, runtime, args[0])
    return launchState(store, runtime)
  },

  setConversationLevel: ({ runtime }, args) =>
    runtime.setConversationLevel(requireString(args[0], 'conversationId'), requireLevel(args[1])),

  setAppearance: ({ store, runtime }, args) => {
    const patch = readAppearancePatch(args[0])
    store.write({ ...store.read(), ...patch })
    return launchState(store, runtime)
  },

  windowMinimize: ({ window }) => window.minimize(),
  windowToggleMaximize: ({ window }) => window.toggleMaximize(),
  windowClose: ({ window }) => window.close(),

  listConversations: ({ runtime }) => runtime.list(),

  createConversation: ({ runtime }, args) => runtime.create(requireString(args[0], 'workspacePath')),

  openConversation: ({ runtime }, args) => runtime.open(requireString(args[0], 'conversationId')),

  sendPrompt: async ({ runtime }, args) => {
    await runtime.prompt(requireString(args[0], 'conversationId'), requireString(args[1], 'text'))
  },

  abortRun: async ({ runtime }, args) => {
    await runtime.abort(requireString(args[0], 'conversationId'))
  },

  setConversationModel: ({ runtime }, args) =>
    runtime.setConversationModel(
      requireString(args[0], 'conversationId'),
      requireString(args[1], 'providerId'),
      requireString(args[2], 'modelId'),
    ),

  renameConversation: ({ runtime }, args) =>
    runtime.rename(requireString(args[0], 'conversationId'), requireString(args[1], 'title')),

  archiveConversation: ({ runtime }, args) => runtime.archive(requireString(args[0], 'conversationId')),
  unarchiveConversation: ({ runtime }, args) => runtime.unarchive(requireString(args[0], 'conversationId')),
  deleteConversation: ({ runtime }, args) => runtime.remove(requireString(args[0], 'conversationId')),

  exportConversation: ({ runtime }, args) => runtime.exportMarkdown(requireString(args[0], 'conversationId')),

  steer: async ({ runtime }, args) => {
    await runtime.steer(requireString(args[0], 'conversationId'), requireString(args[1], 'text'))
  },

  queueMessage: async ({ runtime }, args) => {
    await runtime.queueMessage(requireString(args[0], 'conversationId'), requireString(args[1], 'text'))
  },

  cancelQueued: async ({ runtime }, args) => {
    await runtime.cancelQueued(requireString(args[0], 'conversationId'), requireString(args[1], 'entryId'))
  },

  regenerate: async ({ runtime }, args) => {
    await runtime.regenerate(requireString(args[0], 'conversationId'))
  },

  editMessage: ({ runtime }, args) => {
    const effect = args[3]
    if (effect !== 'replace' && effect !== 'fork') throw new Error('effect must be replace or fork')
    const index = args[1]
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
      throw new Error('userMessageIndex must be a whole number')
    }
    return runtime.editMessage(requireString(args[0], 'conversationId'), index, requireString(args[2], 'text'), effect)
  },

  setThinkingLevel: ({ runtime }, args) => {
    const level = args[1]
    if (!isThinkingLevel(level)) throw new Error('level must be a thinking level')
    return runtime.setThinkingLevel(requireString(args[0], 'conversationId'), level)
  },

  networkState: ({ network }) => network.state(),

  setNetworkAccess: ({ network }, args) => network.set(readNetworkPatch(args[0])),

  regenerateNetworkToken: ({ network }) => network.regenerateToken(),

  providersSnapshot: ({ providers }) => providers.snapshot(),

  saveCatalogProvider: ({ providers }, args) => providers.saveFromCatalog(requireString(args[0], 'providerId'), []),

  saveCustomProvider: ({ providers }, args) => providers.saveCustom(args[0]),

  removeProvider: ({ providers }, args) => {
    providers.remove(requireString(args[0], 'providerId'))
    return providers.snapshot()
  },

  setCredential: ({ providers }, args) =>
    providers.setCredential(requireString(args[0], 'providerId'), requireString(args[1], 'secret')),

  providerModels: ({ providers }, args) => providers.models(requireString(args[0], 'providerId')),

  testProvider: ({ providers }, args) =>
    providers.test(requireString(args[0], 'providerId'), requireString(args[1], 'modelId')),

  permissionRules: ({ runtime }) => runtime.permissionRules(),

  revokePermissionRule: ({ runtime }, args) => runtime.revokeRule(requireString(args[0], 'ruleId')),

  answerApproval: ({ runtime }, args) => {
    const answer = readApprovalAnswer(args[0])
    runtime.answerApproval(answer.conversationId, answer.requestId, {
      decision: answer.decision,
      scope: answer.scope,
      reason: answer.reason,
    })
  },
}

/** What a window opening the workbench is shown. Read fresh every time, because it is all mutable. */
export function launchState(store: StateStore, runtime: RuntimeManager): LaunchState {
  return {
    appVersion: process.env.npm_package_version ?? '0.1.0',
    platform: process.platform,
    workspace: store.read().workspace.selection,
    recents: store.read().workspace.recents,
    permissionLevel: store.read().permissionLevel,
    workspaceLevel: currentWorkspace(store) === undefined ? store.read().permissionLevel : defaultLevel(store),
    workspaceLevels: store.read().workspaceLevels,
    theme: store.read().theme,
    accent: store.read().accent,
    language: store.read().language,
    model: runtime.modelStatus(),
    lastConversationId: store.read().lastConversationId,
  }
}

/** How it looks and reads: the mode, the accent, the language. Any field may be left out. */
export function readAppearancePatch(input: unknown): AppearancePatch {
  if (typeof input !== 'object' || input === null) throw new Error('an appearance patch is required')
  const record = input as Record<string, unknown>
  const patch: AppearancePatch = {}
  if (record.theme !== undefined) {
    if (!isTheme(record.theme)) throw new Error('theme must be system, light or dark')
    patch.theme = record.theme
  }
  if (record.accent !== undefined) {
    if (!isAccent(record.accent)) throw new Error('accent must be one of the palettes this app ships')
    patch.accent = record.accent
  }
  if (record.language !== undefined) {
    if (!isLanguageSetting(record.language)) throw new Error('language must be system, en or zh')
    patch.language = record.language
  }
  return patch
}

/** A patch from the window: only the fields it may change, and only if they are the right shape. */
export function readNetworkPatch(input: unknown): NetworkPatch {
  if (typeof input !== 'object' || input === null) throw new Error('a network patch is required')
  const record = input as Record<string, unknown>
  const patch: NetworkPatch = {}
  if (record.enabled !== undefined) {
    if (typeof record.enabled !== 'boolean') throw new Error('enabled must be a boolean')
    patch.enabled = record.enabled
  }
  if (record.port !== undefined) {
    if (!isPortNumber(record.port)) throw new Error('port must be a whole number between 0 and 65535')
    patch.port = record.port
  }
  if (record.bind !== undefined) {
    if (!isNetworkBind(record.bind)) throw new Error('bind must be local or network')
    patch.bind = record.bind
  }
  return patch
}

/** The window is the process that could be compromised, so its answer is read defensively. */
export function readApprovalAnswer(input: unknown): ApprovalAnswerInput {
  if (typeof input !== 'object' || input === null) throw new Error('an approval answer is required')
  const record = input as Record<string, unknown>
  const decision = record.decision
  if (decision !== 'once' && decision !== 'always' && decision !== 'deny') {
    throw new Error('decision must be once, always, or deny')
  }
  if (record.scope !== undefined && !isRuleScope(record.scope)) throw new Error('scope must be a rule scope')
  return {
    conversationId: requireString(record.conversationId, 'conversationId'),
    requestId: requireString(record.requestId, 'requestId'),
    decision,
    scope: isRuleScope(record.scope) ? record.scope : undefined,
    reason: typeof record.reason === 'string' ? record.reason : undefined,
  }
}

/** Remembers what the window picked, and hands the selection back for the reply. */
export function selectWorkspace(store: StateStore, path: string): WorkspaceSelection {
  const state = store.read()
  const next = rememberWorkspace(state.workspace, workspaceFromPath(path, Date.now()))
  store.write({ ...state, workspace: next })
  return next.selection
}

/** The workspace default is what the settings page writes; a conversation keeps its own. */
export function setWorkspaceLevel(store: StateStore, runtime: RuntimeManager, level: PermissionLevel): void {
  const path = currentWorkspace(store)
  if (path === undefined) store.write({ ...store.read(), permissionLevel: level })
  else runtime.setWorkspaceLevel(path, level)
}

/** The folder this window is working in, when one has been chosen. */
export function currentWorkspace(store: StateStore): Undef<string> {
  const selection = store.read().workspace.selection
  return selection.kind === 'selected' ? selection.workspace.path : undefined
}

export function defaultLevel(store: StateStore): PermissionLevel {
  const path = currentWorkspace(store)
  return path === undefined ? store.read().permissionLevel : defaultLevelFor(store.read(), path)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${field} must be a non-empty string`)
  return value
}

function requireLevel(value: unknown): PermissionLevel {
  if (!isPermissionLevel(value)) throw new Error('level must be a permission level')
  return value
}
