/**
 * The subagents this workbench offers, as policy: a name, what it is for, the standing instruction
 * it runs under, the tools it may reach for, and the turns it gets. Nothing here names pi — a name,
 * a subset and a budget are policy, and the face that turns one into a run is
 * `@alpha/internal-plugins/src/subagents-plugin.ts`, where the agent library is allowed (C2.0).
 *
 * The registry is code rather than a file, because nothing edits one: a settings panel that let a
 * person write a subagent would be the reason to move this to the data directory, and there is no
 * such panel. Two are shipped, because the two things worth handing over are looking and building:
 * one that cannot change anything, and one that can do what the caller does with files.
 */

import type { Undef } from '@alpha/domain'

export interface SubagentDefinition {
  /** The name a call names it by: a word, because it travels in a tool argument. */
  name: string
  /** What it is for, in the words the model reads when it decides whom to hand work to. */
  description: string
  /** The standing instruction it runs under, after the workspace's own prompt. */
  prompt: string
  /** The tools it may use, named out of the ones the calling agent already has. */
  tools: string[]
  /** The turns it gets before it must answer with what it has. */
  maxTurns: number
}

/**
 * What every subagent is told, whichever one it is: that its last message is the whole answer, and
 * that a question is not one. Both are the shape of the tool call that started it — one instruction
 * in, one message back — rather than a preference.
 */
const STANDING =
  'You are a subagent of a workbench agent: it reads your last message as the whole of your answer, and nobody can answer a question you ask. Do the one task you were given, then answer with what you found or did, plainly and completely.'

export const SUBAGENTS: SubagentDefinition[] = [
  {
    name: 'explore',
    description: 'Looks through the workspace and reports what is there. It cannot change anything.',
    prompt: `${STANDING} You may read the workspace and nothing else: do not write or edit a file, and do not run a command.`,
    tools: ['read'],
    maxTurns: 12,
  },
  {
    name: 'builder',
    description: 'Makes the change in the workspace: reads, writes, edits files and runs commands.',
    prompt: `${STANDING} You may change the workspace — read, write, edit, run commands — and you leave it in the state you would want to find it.`,
    tools: ['read', 'write', 'edit', 'bash'],
    maxTurns: 20,
  },
]

/** The subagent a name means, or nothing when this workbench has no such one. */
export function subagentFor(registry: SubagentDefinition[], name: string): Undef<SubagentDefinition> {
  return registry.find((definition) => definition.name === name)
}

/**
 * Whether a subagent may reach for one of the tools its caller has. The list is what it may use, not
 * everything it could: a subagent that cannot write cannot be talked into writing, which is the only
 * way "look but do not touch" can be promised. A tool nobody listed is nobody's — including this
 * one's own `task`, which is what keeps a subagent from handing work to a subagent.
 */
export function allowsTool(definition: SubagentDefinition, toolName: string): boolean {
  return definition.tools.includes(toolName)
}

/** Whether a subagent that has taken this many turns may take another. */
export function withinBudget(definition: SubagentDefinition, turns: number): boolean {
  return turns < definition.maxTurns
}

/**
 * What the model reads when it is deciding whether to hand work over, and to whom. The first
 * sentence is the whole reason the tool exists — what crosses is the task and the answer, not the
 * work — and the list is the only place the names are said.
 */
export function delegatingTo(registry: SubagentDefinition[]): string {
  const listed = registry.map((definition) => `- ${definition.name}: ${definition.description}`).join('\n')
  return `Hands one task to a subagent that runs on its own and answers when it is done. Only the task and the answer cross: what the subagent reads and does does not fill this conversation. Use it for a job narrow enough to be said in one instruction.\n\n${listed}`
}

/** What the model reads when it names a subagent this workbench does not have. */
export function unknownSubagent(registry: SubagentDefinition[], name: string): string {
  const names = registry.map((definition) => definition.name).join(', ')
  return `No subagent is named "${name}". This workbench has: ${names}.`
}
