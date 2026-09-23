/**
 * Assembly (ADR-0025): turns Alpha's plugins into one running pi `Agent`. Tools concatenate in
 * assembly order; the `beforeToolCall` hooks chain in that order, the first block winning and the
 * rest of the chain never asked; the stream is Alpha's own model runtime, dialed per request.
 */

import type { Undef } from '@alpha/domain'
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

/**
 * Chains the plugins' `beforeToolCall` hooks in assembly order onto the agent's one hook. The first
 * block short-circuits the chain; its reason becomes the blocked tool result the model reads.
 */
function chainBeforeToolCall(
  plugins: AlphaPlugin[],
): (context: BeforeToolCallContext) => Promise<Undef<BeforeToolCallResult>> {
  return async (context) => {
    for (const plugin of plugins) {
      const hook = plugin.beforeToolCall
      if (hook === undefined) continue
      const verdict = await hook({
        toolCallId: context.toolCall.id,
        toolName: context.toolCall.name,
        args: context.args,
      })
      const block = verdict?.block
      if (block !== undefined) return { block: true, reason: block.reason }
    }
    return undefined
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
