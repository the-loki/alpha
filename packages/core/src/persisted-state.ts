/**
 * What the workbench remembers between launches, and the validation that runs the moment it is
 * read off disk. Everything here is pure: the main process owns the file, this module owns the
 * shape and decides what a corrupt file means.
 */
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

export type Theme = (typeof THEMES)[number]

const ThemeSchema = Type.Union(THEMES.map((theme) => Type.Literal(theme)))

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

const PersistedStateSchema = Type.Object({
  workspace: WorkspaceStateSchema,
  permissionLevel: PermissionLevelSchema,
  /**
   * The default for new conversations, per workspace. Read entry by entry rather than all at once,
   * so one unreadable default costs that entry and not the remembered workspace with it.
   */
  workspaceLevels: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  theme: Type.Optional(ThemeSchema),
  /** The conversation that was open when the window closed, so the next launch can bring it back. */
  lastConversationId: Type.Optional(Type.String()),
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
  /** Empty when nothing was open, which is also what a launch with no history gets. */
  lastConversationId: string
}

export function emptyPersistedState(): PersistedState {
  return {
    workspace: emptyWorkspaceState(),
    permissionLevel: DEFAULT_LEVEL,
    workspaceLevels: {},
    permissionRules: [],
    theme: 'system',
    lastConversationId: '',
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
    theme: state.theme ?? 'system',
    lastConversationId: state.lastConversationId ?? '',
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
