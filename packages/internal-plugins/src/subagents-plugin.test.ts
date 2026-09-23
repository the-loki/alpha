/**
 * The subagent face, driving a real child agent on a scripted provider: whom the tool offers, what a
 * name that is not there hears, what the child is assembled from, what its answer becomes, and what
 * a run stopped by the caller or by the budget turns into. The blocks a child is under are proved on
 * the full path — the gate asking about the child's own call — in `subagents-in-agent.test.ts`.
 */

import type { AlphaPlugin } from '@alpha/agent'
import { aModel, scriptedModels, textStream, toolNamed, toolUseStream } from '@alpha/agent/testing'
import type { SubagentDefinition } from '@alpha/subagents'
import { SUBAGENTS } from '@alpha/subagents'
import { describe, expect, it } from 'vitest'
import { createSubagentsPlugin, type SubagentsPluginPorts, subagentPluginsOf } from './subagents-plugin.ts'

const named = (name: string): SubagentDefinition => {
  const definition = SUBAGENTS.find((candidate) => candidate.name === name)
  if (definition === undefined) throw new Error(`no subagent ${name}`)
  return definition
}

/** The caller's own plugins: two tools, and one block that says it was consulted. */
const asked: string[] = []
const callerPlugins = (): AlphaPlugin[] => [
  { name: 'tools', tools: () => [toolNamed('read'), toolNamed('bash'), toolNamed('task')] },
  {
    name: 'gate',
    beforeToolCall: async (call) => {
      asked.push(call.toolName)
      return undefined
    },
  },
]

const portsOf = (drives: Array<() => ReturnType<typeof textStream>>, over: Partial<SubagentsPluginPorts> = {}) => {
  const prompts: string[] = []
  const ports: SubagentsPluginPorts = {
    registry: SUBAGENTS,
    plugins: callerPlugins,
    models: scriptedModels(drives),
    model: () => aModel(),
    systemPrompt: async (subagent) => {
      prompts.push(subagent.name)
      return `the workspace prompt\n\n${subagent.prompt}`
    },
    ...over,
  }
  return { ports, prompts }
}

const taskOf = (ports: SubagentsPluginPorts) => {
  const [tool] = createSubagentsPlugin(ports).tools()
  if (tool === undefined) throw new Error('the plugin offers no tool')
  return tool
}

describe('[subagents] the plugin face', () => {
  it('offers one tool that says what may be handed over', () => {
    const { ports } = portsOf([])
    const tool = taskOf(ports)

    expect(tool.name).toBe('task')
    expect(tool.label).not.toBe('')
    expect(tool.description).toContain('explore')
    expect(tool.description).toContain('builder')
    expect(tool.executionMode).toBe('sequential')
    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: { agent: { type: 'string' }, prompt: { type: 'string' } },
      required: ['agent', 'prompt'],
    })
  })

  it('a name that is not in the registry is refused in the words the model reads', async () => {
    const { ports } = portsOf([])

    await expect(taskOf(ports).execute('call-1', { agent: 'fast', prompt: 'go' })).rejects.toThrow(
      'No subagent is named "fast". This workbench has: explore, builder.',
    )
  })

  it('runs the subagent on the caller’s own plugins and answers with what it said', async () => {
    const drives = [() => toolUseStream('read', { text: 'notes.txt' }), () => textStream('the parser is named pi')]
    const { ports, prompts } = portsOf(drives)

    const result = await taskOf(ports).execute('call-2', { agent: 'explore', prompt: 'find the parser' })

    expect(prompts).toEqual(['explore'])
    expect(result?.content).toEqual([{ type: 'text', text: 'the parser is named pi' }])
    expect(asked).toEqual(['read'])
  })

  it('gives the child the tools its definition lists, the blocks the caller is under, and no more', () => {
    const child = subagentPluginsOf(callerPlugins(), named('explore'))

    expect(child.flatMap((plugin) => (plugin.tools?.() ?? []).map((tool) => tool.name))).toEqual(['read'])
    expect(child.map((plugin) => plugin.name)).toEqual(['subagent-tools', 'gate'])
    // The after-run halves stay behind: they belong to the conversation that is running.
    expect(child.every((plugin) => plugin.afterRun === undefined)).toBe(true)
  })

  it('a stopped run is the tool failing, rather than an answer nobody said', async () => {
    const { ports } = portsOf([() => textStream('half an answer')])
    const stop = new AbortController()
    stop.abort()

    await expect(taskOf(ports).execute('call-3', { agent: 'explore', prompt: 'go' }, stop.signal)).rejects.toThrow(
      'The run was stopped before the subagent answered.',
    )
  })

  it('a subagent that spends its turns fails with what it had, saying why', async () => {
    const short: SubagentDefinition = { ...named('explore'), maxTurns: 1 }
    const drives = [() => toolUseStream('read', { text: 'notes.txt' }), () => textStream('never asked')]
    const { ports } = portsOf(drives, { registry: [short] })

    await expect(taskOf(ports).execute('call-4', { agent: 'explore', prompt: 'go' })).rejects.toThrow(
      /It ran out of the 1 turns it was given/,
    )
  })

  it('a conversation with no model cannot run a subagent, and says so', async () => {
    const { ports } = portsOf([], { model: () => undefined })

    await expect(taskOf(ports).execute('call-5', { agent: 'explore', prompt: 'go' })).rejects.toThrow(
      'This conversation has no model to run a subagent on.',
    )
  })
})
