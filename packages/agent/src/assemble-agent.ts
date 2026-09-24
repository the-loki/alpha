/**
 * Assembly (ADR-0025): turns Alpha's plugins into one running pi `Agent`. Tools concatenate in
 * assembly order; the `beforeToolCall` hooks chain in that order, the first block winning and the
 * rest of the chain never asked; the stream is Alpha's own model runtime, dialed per request.
 */

import {
  Agent,
  type AgentMessage,
  type ShouldStopAfterTurnContext,
  type ThinkingLevel,
} from '@earendil-works/pi-agent-core'
import type { Api, Model, Models } from '@earendil-works/pi-ai'
import type { AlphaPlugin } from './plugin-contract.ts'
import { createPluginHost, type PluginHost } from './plugin-host.ts'

/** Everything the assembler needs: the runtime to dial with, the model to run, the plugins. */
export interface AssembleOptions {
  models: Models
  model: Model<Api>
  plugins?: AlphaPlugin[]
  host?: PluginHost
  systemPrompt: string
  messages?: AgentMessage[]
  thinkingLevel?: ThinkingLevel
  sessionId?: string
  /**
   * Where a run decides it has had enough turns — pi's own option, passed through, because a caller
   * that hands the agent a budget is the only one that knows what the budget is.
   */
  shouldStopAfterTurn?: (context: ShouldStopAfterTurnContext, signal?: AbortSignal) => boolean | Promise<boolean>
}

export interface AgentAssembly {
  agent: Agent
  host: PluginHost
}

/** Composes the plugins into one pi `Agent` and returns the host that owns their lifetime. */
export function assembleAgentWithHost(options: AssembleOptions): AgentAssembly {
  const host = options.host ?? createPluginHost(options.plugins ?? [])
  const agent = new Agent({
    initialState: {
      systemPrompt: options.systemPrompt,
      model: options.model,
      thinkingLevel: options.thinkingLevel,
      tools: host.tools(),
      ...(options.messages === undefined ? {} : { messages: options.messages }),
    },
    streamFn: options.models.streamSimple.bind(options.models),
    beforeToolCall: (context) => host.beforeToolCall(context),
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    ...(options.shouldStopAfterTurn === undefined ? {} : { shouldStopAfterTurn: options.shouldStopAfterTurn }),
  })
  host.attach(agent)
  return { agent, host }
}

/** Compatibility wrapper for callers that only need the pi agent. */
export function assembleAgent(options: AssembleOptions): Agent {
  return assembleAgentWithHost(options).agent
}
