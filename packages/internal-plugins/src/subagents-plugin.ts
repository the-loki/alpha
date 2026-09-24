/**
 * The subagents plugin (ADR-0029): one tool, `task`, whose call runs a second agent on the caller's
 * own plugins and answers with what it said. The face names pi because the tool *is* an `AgentTool`
 * and the run is an `assembleAgent` — this package is one of the two allowed to (C2.0) — and the
 * registry behind it is `@alpha/subagents`'s policy, where nothing names pi at all.
 *
 * The child is assembled from the same plugins the caller runs on, filtered twice over: it gets the
 * tools its definition lists and every `beforeToolCall` the caller is under. Nothing else crosses —
 * a plugin's after-run half belongs to the conversation that is running (compaction rewrites *that*
 * agent's history, retry spends *that* conversation's attempts) and a subagent is not that
 * conversation. The block half is not optional: a capability that may stop a call must stop it for a
 * subagent too, and taking the whole chain is what makes that automatic rather than remembered.
 *
 * Its transcript is the child's own and is dropped with it: only aggregate usage is written to
 * the parent session, so what remains in the window is one row — the task, and the answer.
 */

import { type AlphaPlugin, assembleAgent } from '@alpha/agent'
import { addUsage, EMPTY_USAGE, type Undef, type UsageTotals, usageTotals } from '@alpha/domain'
import {
  allowsTool,
  delegatingTo,
  SUBAGENTS,
  type SubagentDefinition,
  subagentFor,
  unknownSubagent,
  withinBudget,
} from '@alpha/subagents'
import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core'
import type { Api, Model, Models } from '@earendil-works/pi-ai'
import { Type } from 'typebox'

/** What the plugin needs: who may be handed work, to run on what, with which plugins. */
export interface SubagentsPluginPorts {
  /** What a workbench offers; the shipped set unless a caller says otherwise. */
  registry?: SubagentDefinition[]
  /** The caller's own plugins, read at assembly: the child is built out of the same set. */
  plugins: () => AlphaPlugin[]
  models: Models
  /** The caller's model, read when a call happens: a conversation can be moved to another. */
  model: () => Undef<Model<Api>>
  /** The prompt the child starts from: the workspace's own, then the subagent's own instruction. */
  systemPrompt: (subagent: SubagentDefinition) => Promise<string>
  /** What the child's model calls spent, whether or not the tool answered successfully. */
  onUsage: (usage: UsageTotals) => void
}

/** A plugin that carries one face: what the base needs to hang it on the agent. */
export interface SubagentsPlugin {
  name: string
  tools: () => AgentTool[]
}

/** What a call names: which subagent, and the one instruction it is given. */
const taskParameters = Type.Object({
  agent: Type.String({ description: 'The subagent to hand the task to.' }),
  prompt: Type.String({ description: 'The task, as one instruction.' }),
})

/** The two things a call carries, read at the boundary pi has just validated them at. */
function askedOf(params: unknown): { agent: string; prompt: string } {
  const record = typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {}
  return { agent: String(record.agent ?? ''), prompt: String(record.prompt ?? '') }
}

/** The tools a subagent may reach for, out of the caller's own, as a plugin of its own. */
function toolsFor(plugins: AlphaPlugin[], definition: SubagentDefinition): AlphaPlugin {
  const tools = plugins.flatMap((plugin) =>
    (plugin.tools?.() ?? []).filter((tool) => allowsTool(definition, tool.name)),
  )
  return { name: 'subagent-tools', tools: () => tools }
}

/** Every block the caller is under, carried to the child unchanged. */
function blocksOf(plugins: AlphaPlugin[]): AlphaPlugin[] {
  return plugins.flatMap((plugin): AlphaPlugin[] =>
    plugin.beforeToolCall === undefined ? [] : [{ name: plugin.name, beforeToolCall: plugin.beforeToolCall }],
  )
}

/** What a subagent is assembled from: the tools it may use, and the blocks it is under. */
export function subagentPluginsOf(plugins: AlphaPlugin[], definition: SubagentDefinition): AlphaPlugin[] {
  return [toolsFor(plugins, definition), ...blocksOf(plugins)]
}

/** What the subagent said: the last text it wrote, which is the whole of its answer. */
function answerOf(messages: AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined || message.role !== 'assistant') continue
    const text = message.content
      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join('\n')
      .trim()
    if (text !== '') return text
  }
  return ''
}

/**
 * One subagent run: assembled, given the task, stopped when the caller stops or the budget is
 * spent, and read for its answer. A run that did not answer is the tool failing, in the words that
 * say why — a subagent that was stopped with half an answer is worth handing back, not hiding.
 */
async function runSubagent(
  ports: SubagentsPluginPorts,
  definition: SubagentDefinition,
  task: string,
  signal?: AbortSignal,
): Promise<string> {
  const model = ports.model()
  if (model === undefined) throw new Error('This conversation has no model to run a subagent on.')
  let turns = 0
  let spent = false
  const child = assembleAgent({
    models: ports.models,
    model,
    plugins: subagentPluginsOf(ports.plugins(), definition),
    systemPrompt: await ports.systemPrompt(definition),
    shouldStopAfterTurn: ({ message, toolResults }) => {
      turns += 1
      if (withinBudget(definition, turns)) return false
      spent = toolResults.length > 0 || message.stopReason === 'length'
      return true
    },
  })
  const stop = (): void => child.abort()
  if (signal?.aborted === true) stop()
  else signal?.addEventListener('abort', stop, { once: true })
  try {
    await child.prompt(task)
  } finally {
    signal?.removeEventListener('abort', stop)
    const usage = child.state.messages.reduce(
      (total, message) => (message.role === 'assistant' ? addUsage(total, usageTotals(message.usage)) : total),
      EMPTY_USAGE,
    )
    ports.onUsage(usage)
  }

  const said = answerOf(child.state.messages)
  if (signal?.aborted === true) throw new Error('The run was stopped before the subagent answered.')
  if (spent) {
    const turnsGiven = definition.maxTurns
    throw new Error(`${said}\n\nIt ran out of the ${turnsGiven} turns it was given.`.trim())
  }
  if (child.state.errorMessage !== undefined) throw new Error(child.state.errorMessage)
  if (said === '') throw new Error('The subagent answered with nothing.')
  return said
}

/** The plugin: the one tool, offering whatever the registry holds. */
export function createSubagentsPlugin(ports: SubagentsPluginPorts): SubagentsPlugin {
  const registry = ports.registry ?? SUBAGENTS
  return {
    name: 'subagents',
    tools: () => [
      {
        name: 'task',
        label: 'Hand a task to a subagent',
        description: delegatingTo(registry),
        parameters: taskParameters,
        // One subagent run is a conversation of its own on the same model runtime, and two at once
        // would interleave: the calls go one at a time.
        executionMode: 'sequential',
        execute: async (_toolCallId, params, signal) => {
          const asked = askedOf(params)
          const definition = subagentFor(registry, asked.agent)
          if (definition === undefined) throw new Error(unknownSubagent(registry, asked.agent))
          const said = await runSubagent(ports, definition, asked.prompt, signal)
          return { content: [{ type: 'text', text: said }], details: undefined }
        },
      },
    ],
  }
}
