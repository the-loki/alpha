/**
 * Assembly (ADR-0025): turns Alpha's plugins into one running pi `Agent`. Tools concatenate in
 * assembly order; the `beforeToolCall` hooks chain in that order, the first block winning and the
 * rest of the chain never asked; the stream is Alpha's own model runtime, dialed per request.
 */

import type { Undef } from '@alpha/domain'
import type { PluginToolCall } from '@alpha/plugin'
import { chainToolVerdicts } from '@alpha/plugin'
import {
  Agent,
  type AgentMessage,
  type BeforeToolCallContext,
  type BeforeToolCallResult,
  type ThinkingLevel,
} from '@earendil-works/pi-agent-core'
import type { Api, Model, Models } from '@earendil-works/pi-ai'
import type { AlphaPlugin } from './plugin-contract.ts'

/** Everything the assembler needs: the runtime to dial with, the model to run, the plugins. */
export interface AssembleOptions {
  models: Models
  model: Model<Api>
  plugins: AlphaPlugin[]
  systemPrompt: string
  messages?: AgentMessage[]
  thinkingLevel?: ThinkingLevel
  sessionId?: string
}

/** pi hands a hook its own context; a face is handed `@alpha/plugin`'s call. */
function toolCallOf(context: BeforeToolCallContext): PluginToolCall {
  return { toolCallId: context.toolCall.id, toolName: context.toolCall.name, args: context.args }
}

/**
 * The plugins' `beforeToolCall` hooks, in assembly order, onto the agent's one hook: the chain is
 * the library's (`chainToolVerdicts`), and a winning block becomes pi's shape, whose reason is the
 * blocked tool result the model reads.
 */
function chainBeforeToolCall(
  plugins: AlphaPlugin[],
): (context: BeforeToolCallContext) => Promise<Undef<BeforeToolCallResult>> {
  return async (context) => {
    // The list is read when a call happens rather than when the agent is assembled: registering a
    // plugin is what puts it in the chain, and folding the list here is the whole of the adapter.
    const hooks = plugins.flatMap((plugin) => (plugin.beforeToolCall === undefined ? [] : [plugin.beforeToolCall]))
    const verdict = await chainToolVerdicts(hooks)(toolCallOf(context))
    return verdict?.block === undefined ? undefined : { block: true, reason: verdict.block.reason }
  }
}

/** Composes the plugins into one pi `Agent` running on Alpha's model runtime. */
export function assembleAgent(options: AssembleOptions): Agent {
  return new Agent({
    initialState: {
      systemPrompt: options.systemPrompt,
      model: options.model,
      thinkingLevel: options.thinkingLevel,
      tools: options.plugins.flatMap((plugin) => plugin.tools?.() ?? []),
      ...(options.messages === undefined ? {} : { messages: options.messages }),
    },
    streamFn: options.models.streamSimple.bind(options.models),
    beforeToolCall: chainBeforeToolCall(options.plugins),
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
  })
}
