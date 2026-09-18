/**
 * What the workbench remembers between launches, and the validation that runs the moment it is
 * read off disk. Everything here is pure: the main process owns the file, this module owns the
 * shape and decides what a corrupt file means.
 */
import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'
import {
  DEFAULT_LEVEL,
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
  toolName: Type.String(),
  pattern: Type.String(),
  createdAt: Type.Number(),
})

/**
 * Rules are validated one by one rather than with the rest of the file: one unreadable rule should
 * cost the user that rule, not the remembered workspace and the permission level with it.
 */
const PersistedStateSchema = Type.Object({
  workspace: WorkspaceStateSchema,
  permissionLevel: PermissionLevelSchema,
})

type PersistedStateShape = Static<typeof PersistedStateSchema>

export interface PersistedState {
  workspace: WorkspaceState
  permissionLevel: PermissionLevel
  permissionRules: PermissionRule[]
}

export function emptyPersistedState(): PersistedState {
  return { workspace: emptyWorkspaceState(), permissionLevel: DEFAULT_LEVEL, permissionRules: [] }
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
    permissionRules: readRules(readRulesField(candidate)),
  }
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
