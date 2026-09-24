import type { AgentTool } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'
import { assembleAgentWithHost } from './assemble-agent.ts'
import type { AlphaPlugin } from './plugin-contract.ts'
import { createPluginHost } from './plugin-host.ts'
import { aModel, scriptedModels, toolNamed } from './scripted-provider.ts'

const tool = (name: string): AgentTool => toolNamed(name)

describe('[agent] the plugin host', () => {
  it('rejects duplicate tool names at the public assembly seam', () => {
    const plugins: AlphaPlugin[] = [
      { name: 'first', tools: () => [tool('same')] },
      { name: 'second', tools: () => [tool('same')] },
    ]

    expect(() => createPluginHost(plugins).tools()).toThrow('duplicate tool name: same')
  })

  it('refreshes only the current plugin tools while preserving assembly order', () => {
    let changed: (() => void) | undefined
    let offered = [tool('remote-one')]
    const remote: AlphaPlugin = {
      name: 'remote',
      tools: () => offered,
      onToolsChanged: (listener) => {
        changed = listener
        return () => {
          changed = undefined
        }
      },
    }
    const host = createPluginHost([remote, { name: 'local', tools: () => [tool('local')] }])
    const { agent } = assembleAgentWithHost({
      models: scriptedModels([]),
      model: aModel(),
      host,
      systemPrompt: 's',
    })

    offered = [tool('remote-two')]
    changed?.()

    expect(agent.state.tools.map((candidate) => candidate.name)).toEqual(['remote-two', 'local'])
  })

  it('stops refreshing and closes each plugin once', async () => {
    let changed: (() => void) | undefined
    const events: string[] = []
    const plugin: AlphaPlugin = {
      name: 'remote',
      tools: () => [tool('one')],
      onToolsChanged: (listener) => {
        changed = listener
        return () => events.push('unsubscribe')
      },
      close: async () => {
        events.push('close')
      },
    }
    const host = createPluginHost([plugin])
    const { agent } = assembleAgentWithHost({
      models: scriptedModels([]),
      model: aModel(),
      host,
      systemPrompt: 's',
    })

    await host.close()
    changed?.()
    await host.close()

    expect(agent.state.tools.map((candidate) => candidate.name)).toEqual(['one'])
    expect(events).toEqual(['unsubscribe', 'close'])
  })
})
