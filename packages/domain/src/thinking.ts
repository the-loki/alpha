/**
 * How much reasoning the model is asked to spend before answering. The values mirror what the
 * runtime accepts; the labels are what the window shows.
 */

import type { TextKey } from '@alpha/i18n'

export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = 'medium'

const LABELS: Record<ThinkingLevel, TextKey> = {
  off: 'thinking.off',
  minimal: 'thinking.minimal',
  low: 'thinking.low',
  medium: 'thinking.medium',
  high: 'thinking.high',
  xhigh: 'thinking.xhigh',
  max: 'thinking.max',
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === 'string' && (THINKING_LEVELS as readonly string[]).includes(value)
}

export function thinkingKey(level: ThinkingLevel): TextKey {
  return LABELS[level]
}
