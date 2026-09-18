/**
 * The permission ladder. This module owns the vocabulary and the presentation names; the
 * decision table for (level, tool risk class) arrives with the gating work in T5, and the
 * rules for remembering an approval with it.
 */

export const PERMISSION_LEVELS = ['plan', 'ask', 'accept-edits', 'full-access'] as const

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

export type LevelTone = 'info' | 'amber' | 'jade' | 'ember'

export const DEFAULT_LEVEL: PermissionLevel = 'ask'

const LABELS: Record<PermissionLevel, string> = {
  plan: 'Plan',
  ask: 'Ask',
  'accept-edits': 'Accept edits',
  'full-access': 'Full access',
}

const TONES: Record<PermissionLevel, LevelTone> = {
  plan: 'info',
  ask: 'amber',
  'accept-edits': 'jade',
  'full-access': 'ember',
}

const DESCRIPTIONS: Record<PermissionLevel, string> = {
  plan: 'Reads only. The agent proposes changes instead of making them.',
  ask: 'Asks before every file change and every command.',
  'accept-edits': 'File changes run without asking. Commands still ask.',
  'full-access': 'Nothing asks. Every tool call runs immediately.',
}

export function isPermissionLevel(value: unknown): value is PermissionLevel {
  return typeof value === 'string' && (PERMISSION_LEVELS as readonly string[]).includes(value)
}

export function levelLabel(level: PermissionLevel): string {
  return LABELS[level]
}

export function levelTone(level: PermissionLevel): LevelTone {
  return TONES[level]
}

export function levelDescription(level: PermissionLevel): string {
  return DESCRIPTIONS[level]
}
