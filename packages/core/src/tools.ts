/**
 * The tools the agent can reach for, and how dangerous each one is. The risk class is the input
 * the permission ladder decides on, so it is data here rather than a property of the tool
 * implementation: the gate has to be able to answer "what is this?" before anything runs.
 */

import type { TextKey } from './i18n.ts'

export const TOOL_RISKS = ['read', 'write', 'execute'] as const

export type ToolRisk = (typeof TOOL_RISKS)[number]

const RISKS: Record<string, ToolRisk> = {
  read: 'read',
  write: 'write',
  edit: 'write',
  bash: 'execute',
}

/**
 * A tool nobody classified is treated as the most dangerous class. The alternative — assuming
 * unknown tools are harmless — fails open, which is the wrong way for a permission gate to fail.
 */
export function toolRiskOf(toolName: string): ToolRisk {
  return RISKS[toolName] ?? 'execute'
}

export function isToolRisk(value: unknown): value is ToolRisk {
  return typeof value === 'string' && (TOOL_RISKS as readonly string[]).includes(value)
}

/** One word for the row's glyph tooltip, so the class is readable and not only coloured. */
export function riskKey(risk: ToolRisk): TextKey {
  return risk === 'read' ? 'risk.reads' : risk === 'write' ? 'risk.writes' : 'risk.runs'
}
