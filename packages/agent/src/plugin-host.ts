import type { Undef } from '@alpha/domain'
import { chainToolVerdicts } from '@alpha/plugin'
import type { Agent, AgentTool, BeforeToolCallContext, BeforeToolCallResult } from '@earendil-works/pi-agent-core'
import type { AlphaPlugin } from './plugin-contract.ts'

export interface PluginHost {
  readonly plugins: readonly AlphaPlugin[]
  tools(): AgentTool[]
  beforeToolCall(context: BeforeToolCallContext): Promise<Undef<BeforeToolCallResult>>
  attach(agent: Agent): void
  close(): Promise<void>
}

const toolCallOf = (context: BeforeToolCallContext) => ({
  toolCallId: context.toolCall.id,
  toolName: context.toolCall.name,
  args: context.args,
})

function toolsOf(plugins: readonly AlphaPlugin[]): AgentTool[] {
  const tools = plugins.flatMap((plugin) => plugin.tools?.() ?? [])
  const names = new Set<string>()
  for (const tool of tools) {
    if (names.has(tool.name)) throw new Error(`duplicate tool name: ${tool.name}`)
    names.add(tool.name)
  }
  return tools
}

export function createPluginHost(input: readonly AlphaPlugin[]): PluginHost {
  const plugins = Object.freeze([...input])
  let agent: Undef<Agent>
  let closed = false
  const unsubscribers: Array<() => void> = []

  const host: PluginHost = {
    plugins,
    tools: () => toolsOf(plugins),
    beforeToolCall: async (context) => {
      const hooks = plugins.flatMap((plugin) => (plugin.beforeToolCall === undefined ? [] : [plugin.beforeToolCall]))
      const verdict = await chainToolVerdicts(hooks)(toolCallOf(context))
      return verdict?.block === undefined ? undefined : { block: true, reason: verdict.block.reason }
    },
    attach: (next) => {
      if (closed) throw new Error('plugin host is closed')
      if (agent !== undefined) throw new Error('plugin host is already attached')
      agent = next
      for (const plugin of plugins) {
        const subscribe = plugin.onToolsChanged
        if (subscribe === undefined) continue
        unsubscribers.push(
          subscribe(() => {
            if (!closed && agent === next) next.state.tools = host.tools()
          }),
        )
      }
    },
    close: async () => {
      if (closed) return
      closed = true
      for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
      await Promise.all(
        [...plugins].reverse().map(async (plugin) => {
          await plugin.close?.()
        }),
      )
    },
  }
  return host
}
