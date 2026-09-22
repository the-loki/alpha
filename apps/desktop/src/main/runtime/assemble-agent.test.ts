import type { AgentEvent, AgentMessage, AgentTool } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { assembleAgent } from './assemble-agent.ts'
import type { AlphaPlugin } from './plugin-contract.ts'
import { aModel, scriptedModels, textStream, toolNamed, toolUseStream } from './scripted-provider.ts'

const assistantOf = (messages: AgentMessage[]): AssistantMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant') return message
  }
  return undefined
}

const toolResultOf = (messages: AgentMessage[]): { isError: boolean; text: string } | undefined => {
  for (const message of messages) {
    if (message.role !== 'toolResult') continue
    const first = message.content[0]
    return { isError: message.isError, text: first !== undefined && first.type === 'text' ? first.text : '' }
  }
  return undefined
}

describe('assembling the plugins into one agent', () => {
  it("concatenates every plugin's tools in assembly order", () => {
    const withTools = (name: string, tools: AgentTool[]): AlphaPlugin => ({ name, tools: () => tools })
    const agent = assembleAgent({
      models: scriptedModels([]),
      model: aModel(),
      plugins: [withTools('first', [toolNamed('read')]), { name: 'second' }, withTools('third', [toolNamed('bash')])],
      systemPrompt: 's',
    })
    expect(agent.state.tools.map((tool) => tool.name)).toEqual(['read', 'bash'])
  })

  it('a full scripted run: prompt resolves, events fire, transcript ends user to assistant', async () => {
    const models = scriptedModels([() => textStream('hello back')])
    const agent = assembleAgent({ models, model: aModel(), plugins: [], systemPrompt: 'you are scripted' })
    const events: AgentEvent[] = []
    agent.subscribe((event) => {
      events.push(event)
    })
    await agent.prompt('hello')
    expect(events.map((event) => event.type)).toContain('agent_start')
    expect(events.map((event) => event.type)).toContain('agent_end')
    expect(agent.state.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant'])
    expect(assistantOf(agent.state.messages)?.content[0]).toMatchObject({ type: 'text', text: 'hello back' })
  })

  it('beforeToolCall hooks that do not block pass through, and the tool executes', async () => {
    const executed: string[] = []
    const asked: string[] = []
    const observer = (name: string): AlphaPlugin => ({
      name,
      beforeToolCall: async () => {
        asked.push(name)
        return undefined
      },
    })
    const models = scriptedModels([() => toolUseStream('echo', { text: 'carried' }), () => textStream('all done')])
    const agent = assembleAgent({
      models,
      model: aModel(),
      plugins: [observer('first'), observer('second')],
      systemPrompt: 's',
    })
    agent.state.tools = [toolNamed('echo', executed)]
    await agent.prompt('run echo')
    expect(asked).toEqual(['first', 'second'])
    expect(executed).toEqual(['echo'])
    expect(toolResultOf(agent.state.messages)).toMatchObject({ isError: false, text: 'carried' })
  })

  it('the first blocking hook wins: its reason is the tool result, later hooks are never asked', async () => {
    const executed: string[] = []
    const asked: string[] = []
    const plugins: AlphaPlugin[] = [
      {
        name: 'passes',
        beforeToolCall: async () => {
          asked.push('passes')
          return undefined
        },
      },
      {
        name: 'gate',
        beforeToolCall: async () => {
          asked.push('gate')
          return { block: { reason: 'the gate says no' } }
        },
      },
      {
        name: 'never asked',
        beforeToolCall: async () => {
          asked.push('never asked')
          return undefined
        },
      },
    ]
    const models = scriptedModels([() => toolUseStream('bash', { text: 'rm -rf /' }), () => textStream('giving up')])
    const agent = assembleAgent({ models, model: aModel(), plugins, systemPrompt: 's' })
    agent.state.tools = [toolNamed('bash', executed)]
    await agent.prompt('run bash')
    expect(asked).toEqual(['passes', 'gate'])
    expect(executed).toEqual([])
    expect(toolResultOf(agent.state.messages)).toMatchObject({ isError: true, text: 'the gate says no' })
    expect(assistantOf(agent.state.messages)?.content[0]).toMatchObject({ type: 'text', text: 'giving up' })
  })
})
