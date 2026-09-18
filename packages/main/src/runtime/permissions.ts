/**
 * The gate's reach into the workbench: the level in force, the rules it has remembered, and the
 * two moments the store has to be written — a new rule, and a rule taken back. What the gate
 * decides with them is core's business; this is only how it reaches them.
 */
import type { ApprovalAsk, ConversationSummary, PermissionLevel, PermissionRule } from '@alpha/core'
import type { StateStore } from '../state-store.ts'
import type { PermissionPorts } from './conversation-runtime.ts'
import type { ApprovalAnswer } from './gate.ts'

export interface PermissionPortOptions {
  store: StateStore
  /** The level in force for one conversation, which is what the gate asks about. */
  levelOf: (conversationId: string) => PermissionLevel
  ask: (conversationId: string, ask: ApprovalAsk) => Promise<ApprovalAnswer>
  changed: (rules: PermissionRule[]) => void
}

export function createPermissionPorts(options: PermissionPortOptions): PermissionPorts {
  return {
    level: options.levelOf,
    rules: () => options.store.read().permissionRules,
    remember: (rule) => options.changed(writeRules(options.store, [...options.store.read().permissionRules, rule])),
    ask: options.ask,
  }
}

/** Removes one rule and writes the rest. The gate reads the rules at the next call, so it applies then. */
export function revokeRule(store: StateStore, ruleId: string): PermissionRule[] {
  return writeRules(
    store,
    store.read().permissionRules.filter((rule) => rule.id !== ruleId),
  )
}

function writeRules(store: StateStore, rules: PermissionRule[]): PermissionRule[] {
  store.write({ ...store.read(), permissionRules: rules })
  return rules
}

/** A conversation that has been given a level of its own: the gate reads it before the next call. */
export function withLevel(conversation: ConversationSummary, level: PermissionLevel): ConversationSummary {
  return { ...conversation, permissionLevel: level, updatedAt: Date.now() }
}

/** The default for new conversations in one workspace, which is the settings page's other half. */
export function rememberWorkspaceLevel(store: StateStore, workspacePath: string, level: PermissionLevel): void {
  const state = store.read()
  store.write({
    ...state,
    permissionLevel: level,
    workspaceLevels: { ...state.workspaceLevels, [workspacePath]: level },
  })
}
