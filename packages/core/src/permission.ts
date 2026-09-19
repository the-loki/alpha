/**
 * The permission ladder: four levels, the decision table they make over a tool's risk class, and
 * the rules that stand in for a decision the user has already made twice. All of it is pure — the
 * gate asks these functions, and the window only ever sees their answers.
 */
import type { TextKey } from './i18n.ts'
import type { Undef } from './maybe.ts'
import type { ToolRisk } from './tools.ts'

export const PERMISSION_LEVELS = ['plan', 'ask', 'accept-edits', 'full-access'] as const

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

export type LevelTone = 'info' | 'amber' | 'jade' | 'warm'

export const DEFAULT_LEVEL: PermissionLevel = 'ask'

const LABELS: Record<PermissionLevel, TextKey> = {
  plan: 'level.plan',
  ask: 'level.ask',
  'accept-edits': 'level.acceptEdits',
  'full-access': 'level.fullAccess',
}

const TONES: Record<PermissionLevel, LevelTone> = {
  plan: 'info',
  ask: 'amber',
  'accept-edits': 'jade',
  'full-access': 'warm',
}

const DESCRIPTIONS: Record<PermissionLevel, TextKey> = {
  plan: 'level.plan.about',
  ask: 'level.ask.about',
  'accept-edits': 'level.acceptEdits.about',
  'full-access': 'level.fullAccess.about',
}

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return typeof value === 'string' && (PERMISSION_LEVELS as readonly string[]).includes(value)
}

/** The key the dictionary answers with the level's name. */
export function levelKey(level: PermissionLevel): TextKey {
  return LABELS[level]
}

export function levelTone(level: PermissionLevel): LevelTone {
  return TONES[level]
}

/** The key the dictionary answers with what the level means. */
export function levelDescriptionKey(level: PermissionLevel): TextKey {
  return DESCRIPTIONS[level]
}

/** What the ladder says about a call before the user is consulted. */
export type GateDecision = 'allow' | 'ask' | 'block'

const TABLE: Record<PermissionLevel, Record<ToolRisk, GateDecision>> = {
  plan: { read: 'allow', write: 'block', execute: 'block' },
  ask: { read: 'allow', write: 'ask', execute: 'ask' },
  'accept-edits': { read: 'allow', write: 'allow', execute: 'ask' },
  'full-access': { read: 'allow', write: 'allow', execute: 'allow' },
}

export function decideToolCall(level: PermissionLevel, risk: ToolRisk): GateDecision {
  return TABLE[level][risk]
}

/** How far a remembered rule reaches: one conversation, or every conversation in the workspace. */
export type RuleScope = 'conversation' | 'workspace'

export interface PermissionRule {
  id: string
  scope: RuleScope
  /** Empty for a workspace rule, which is the only kind that outlives its conversation. */
  conversationId: string
  /**
   * The folder the rule was granted in. "Always allow" is a decision about the code in front of
   * you, so it must never reach a different project — a rule granted in a trusted repo would
   * otherwise silently cover a private one.
   */
  workspacePath: string
  toolName: string
  /** A command prefix for commands, a path prefix for file tools, exact arguments otherwise. */
  pattern: string
  createdAt: number
}

export const RULE_SCOPES: RuleScope[] = ['conversation', 'workspace']

export function isRuleScope(value: unknown): value is RuleScope {
  return value === 'conversation' || value === 'workspace'
}

/** The key the dictionary answers with how far a remembered rule reaches. */
export function ruleScopeKey(scope: RuleScope): TextKey {
  return scope === 'conversation' ? 'rule.conversation' : 'rule.workspace'
}

export type CallEvaluation =
  | { outcome: 'allow'; by: 'level' }
  | { outcome: 'allow'; by: 'rule'; ruleId: string }
  | { outcome: 'ask' }
  | { outcome: 'block'; reason: string }

export interface CallContext {
  level: PermissionLevel
  risk: ToolRisk
  toolName: string
  args: Record<string, unknown>
  conversationId: string
  workspacePath: string
  rules: PermissionRule[]
}

/**
 * The whole policy for one call: a rule the user already answered with first, then the ladder. A
 * rule outranks the ladder in both directions — it can approve what plan blocks, because pressing
 * "always allow" is a stronger signal than the chip's default.
 */
export function evaluateCall(context: CallContext): CallEvaluation {
  const rule = context.rules.find((candidate) => appliesTo(candidate, context))
  if (rule !== undefined) return { outcome: 'allow', by: 'rule', ruleId: rule.id }

  const decision = decideToolCall(context.level, context.risk)
  if (decision === 'allow') return { outcome: 'allow', by: 'level' }
  if (decision === 'ask') return { outcome: 'ask' }
  return { outcome: 'block', reason: blockReason(context) }
}

function appliesTo(rule: PermissionRule, context: CallContext): boolean {
  if (rule.toolName !== context.toolName) return false
  if (rule.workspacePath !== context.workspacePath) return false
  if (rule.scope === 'conversation' && rule.conversationId !== context.conversationId) return false
  return ruleMatches(rule, context.toolName, context.args)
}

function blockReason(context: CallContext): string {
  const what = context.risk === 'execute' ? 'running commands' : 'changing files'
  return `This conversation is in Plan, which blocks ${what}. Nothing ran. If this is wanted, the user can raise the permission level.`
}

const COMMAND_TOOLS = ['bash']
const FILE_TOOLS = ['read', 'write', 'edit']

/** A shell operator after the approved prefix means this is no longer the command that was approved. */
const SHELL_OPERATORS = /[;&|<>`]|\$\(/

export function normalizeCommand(command: string): string {
  return command.replace(/\s+/g, ' ').trim()
}

export function normalizePath(path: string): string {
  const collapsed = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '')
  return collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
}

/** The one string a rule for this call would be about, or none when the arguments offer nothing. */
export function patternOf(toolName: string, args: Record<string, unknown>): Undef<string> {
  if (COMMAND_TOOLS.includes(toolName)) {
    return typeof args.command === 'string' ? normalizeCommand(args.command) : undefined
  }
  if (FILE_TOOLS.includes(toolName)) {
    return typeof args.path === 'string' ? normalizePath(args.path) : undefined
  }
  return JSON.stringify(args)
}

export function ruleMatches(rule: PermissionRule, toolName: string, args: Record<string, unknown>): boolean {
  if (rule.toolName !== toolName) return false
  const pattern = patternOf(toolName, args)
  if (pattern === undefined) return false
  if (COMMAND_TOOLS.includes(toolName)) return matchesCommand(rule.pattern, pattern)
  if (FILE_TOOLS.includes(toolName)) return matchesPath(rule.pattern, pattern)
  return rule.pattern === pattern
}

/** Exact, or the approved command followed by more arguments — never a second command. */
function matchesCommand(pattern: string, command: string): boolean {
  const approved = normalizeCommand(pattern)
  if (command === approved) return true
  if (!command.startsWith(`${approved} `)) return false
  return !SHELL_OPERATORS.test(command.slice(approved.length))
}

/** Exact, or anything under it: a rule for a folder covers the files in it. */
function matchesPath(pattern: string, path: string): boolean {
  const approved = normalizePath(pattern)
  return path === approved || path.startsWith(`${approved}/`)
}
