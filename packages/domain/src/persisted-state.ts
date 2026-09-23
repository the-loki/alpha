/**
 * What the workbench remembers between launches, and the validation that runs the moment it is
 * read off disk. Everything here is pure: the main process owns the file, this module owns the
 * shape and decides what a corrupt file means.
 */

import { DEFAULT_LANGUAGE, LANGUAGE_SETTINGS, type LanguageSetting } from '@alpha/i18n'
import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'
import {
  DEFAULT_LEVEL,
  isPermissionLevel,
  PERMISSION_LEVELS,
  type PermissionLevel,
  type PermissionRule,
  RULE_SCOPES,
} from './permission.ts'
import { emptyWorkspaceState, type WorkspaceState } from './workspace.ts'

const WorkspaceRefSchema = Type.Object({
  path: Type.String(),
  name: Type.String(),
  lastOpenedAt: Type.Number(),
})

const WorkspaceSelectionSchema = Type.Union([
  Type.Object({ kind: Type.Literal('none') }),
  Type.Object({ kind: Type.Literal('selected'), workspace: WorkspaceRefSchema }),
])

const WorkspaceStateSchema = Type.Object({
  selection: WorkspaceSelectionSchema,
  recents: Type.Array(WorkspaceRefSchema),
})

const PermissionLevelSchema = Type.Union(PERMISSION_LEVELS.map((level) => Type.Literal(level)))

const RuleSchema = Type.Object({
  id: Type.String(),
  scope: Type.Union(RULE_SCOPES.map((scope) => Type.Literal(scope))),
  conversationId: Type.String(),
  workspacePath: Type.String(),
  toolName: Type.String(),
  pattern: Type.String(),
  createdAt: Type.Number(),
})

/**
 * Rules are validated one by one rather than with the rest of the file: one unreadable rule should
 * cost the user that rule, not the remembered workspace and the permission level with it.
 */
export const THEMES = ['system', 'dark', 'light'] as const

/** Light is what a fresh install opens on (C5.2); `system` follows the machine from then on. */
export const DEFAULT_THEME: Theme = 'light'

export type Theme = (typeof THEMES)[number]

const ThemeSchema = Type.Union(THEMES.map((theme) => Type.Literal(theme)))

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

const LanguageSchema = Type.Union(LANGUAGE_SETTINGS.map((language) => Type.Literal(language)))

export const NETWORK_BINDS = ['local', 'network'] as const

/** Whether the workbench is reachable from a browser, and how far that reach goes. */
export type NetworkBind = (typeof NETWORK_BINDS)[number]

export interface NetworkAccess {
  /** Off until the user turns it on: a workbench that opened a port unasked would be a surprise. */
  enabled: boolean
  port: number
  /** `local` is this machine; `network` is every interface it has (C6.2). */
  bind: NetworkBind
  /** Empty until it is first needed; minted when the switch goes on. */
  token: string
}

export function emptyNetworkAccess(): NetworkAccess {
  return { enabled: false, port: 4123, bind: 'local', token: '' }
}

export function isNetworkBind(value: unknown): value is NetworkBind {
  return typeof value === 'string' && (NETWORK_BINDS as readonly string[]).includes(value)
}

/** A port as both ends of the wire accept it: zero asks the system to pick one. */
export function isPortNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 65535
}

const NetworkSchema = Type.Object({
  enabled: Type.Boolean(),
  port: Type.Number(),
  bind: Type.Union(NETWORK_BINDS.map((bind) => Type.Literal(bind))),
  token: Type.String(),
})

const PersistedStateSchema = Type.Object({
  workspace: WorkspaceStateSchema,
  permissionLevel: PermissionLevelSchema,
  /**
   * The default for new conversations, per workspace. Read entry by entry rather than all at once,
   * so one unreadable default costs that entry and not the remembered workspace with it.
   */
  workspaceLevels: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  theme: Type.Optional(ThemeSchema),
  /** Absent in a file written before the interface had a second language. */
  language: Type.Optional(LanguageSchema),
  /** The conversation that was open when the window closed, so the next launch can bring it back. */
  lastConversationId: Type.Optional(Type.String()),
  /** Browser access: absent in a file written before the workbench could be served. */
  network: Type.Optional(NetworkSchema),
})

type PersistedStateShape = Static<typeof PersistedStateSchema>

export interface PersistedState {
  workspace: WorkspaceState
  /** The level for a workspace that has never been given one of its own. */
  permissionLevel: PermissionLevel
  workspaceLevels: Record<string, PermissionLevel>
  permissionRules: PermissionRule[]
  /** System by default: the app follows the room it is in unless told otherwise. */
  theme: Theme
  /** Which language the interface is written in, for every client of this workbench. */
  language: LanguageSetting
  /** Empty when nothing was open, which is also what a launch with no history gets. */
  lastConversationId: string
  network: NetworkAccess
}

export function emptyPersistedState(): PersistedState {
  return {
    workspace: emptyWorkspaceState(),
    permissionLevel: DEFAULT_LEVEL,
    workspaceLevels: {},
    permissionRules: [],
    theme: DEFAULT_THEME,
    language: DEFAULT_LANGUAGE,
    lastConversationId: '',
    network: emptyNetworkAccess(),
  }
}

/** The level a new conversation in this workspace starts at. */
export function defaultLevelFor(state: PersistedState, workspacePath: string): PermissionLevel {
  return state.workspaceLevels[workspacePath] ?? state.permissionLevel
}

/**
 * A file that does not match the schema is treated as absent rather than repaired: the state is
 * a convenience, and guessing at a half-written file is how a workbench ends up pointing at a
 * folder the user never chose.
 */
export function parsePersistedState(raw: unknown): PersistedState {
  const candidate = typeof raw === 'string' ? parseJson(raw) : raw
  if (!Value.Check(PersistedStateSchema, candidate)) return emptyPersistedState()
  const state: PersistedStateShape = candidate
  return {
    workspace: state.workspace,
    permissionLevel: state.permissionLevel,
    workspaceLevels: readLevels(readLevelsField(candidate)),
    permissionRules: readRules(readRulesField(candidate)),
    theme: state.theme ?? DEFAULT_THEME,
    language: state.language ?? DEFAULT_LANGUAGE,
    lastConversationId: state.lastConversationId ?? '',
    network: readNetwork(readNetworkField(candidate)),
  }
}

/**
 * Browser access, read field by field: a port that is not a port costs the port, not the whole
 * setting — the same bargain the permission levels get.
 */
function readNetworkField(candidate: unknown): unknown {
  return typeof candidate === 'object' && candidate !== null ? (candidate as { network?: unknown }).network : undefined
}

function readNetwork(value: unknown): NetworkAccess {
  const fallback = emptyNetworkAccess()
  if (typeof value !== 'object' || value === null) return fallback
  const record = value as Record<string, unknown>
  const chosen = record.port
  const usable = isPortNumber(chosen) ? chosen : undefined
  return {
    enabled: record.enabled === true,
    port: usable ?? fallback.port,
    bind: isNetworkBind(record.bind) ? record.bind : fallback.bind,
    token: typeof record.token === 'string' ? record.token : fallback.token,
  }
}

function readLevelsField(candidate: unknown): unknown {
  return typeof candidate === 'object' && candidate !== null
    ? (candidate as { workspaceLevels?: unknown }).workspaceLevels
    : undefined
}

/** A default per workspace, dropping any entry that is not a level rather than the whole map. */
function readLevels(value: unknown): Record<string, PermissionLevel> {
  if (typeof value !== 'object' || value === null) return {}
  const levels: Record<string, PermissionLevel> = {}
  for (const [path, level] of Object.entries(value)) {
    if (typeof path === 'string' && isPermissionLevel(level)) levels[path] = level
  }
  return levels
}

function readRulesField(candidate: unknown): unknown {
  return typeof candidate === 'object' && candidate !== null
    ? (candidate as { permissionRules?: unknown }).permissionRules
    : undefined
}

function readRules(value: unknown): PermissionRule[] {
  if (!Array.isArray(value)) return []
  const rules: PermissionRule[] = []
  for (const candidate of value) {
    if (Value.Check(RuleSchema, candidate)) rules.push(Value.Decode(RuleSchema, candidate))
  }
  return rules
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
