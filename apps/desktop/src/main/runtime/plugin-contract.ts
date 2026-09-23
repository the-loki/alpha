/**
 * The plugin contract Alpha assembles its agent from (ADR-0025), as pi needs it: the vocabulary of
 * a face is `@alpha/plugin`, and what lives here is the binding — where pi's `AgentTool` goes, and
 * what a hook is handed. Tools concatenate in assembly order; `beforeToolCall` chains in that order
 * with the first block winning (the chain itself is `chainToolVerdicts`, in the library); `afterRun`
 * observes a finished run and may ask the base to retry it. The contract is Alpha's own: no external
 * files, no loader, no re-implementation of coding-agent's extension format.
 */

import type { Undef } from '@alpha/domain'
import type { AfterRunOutcome, AfterRunVerdict, BeforeToolCallHook } from '@alpha/plugin'
import type { Agent, AgentTool } from '@earendil-works/pi-agent-core'
import type { Api, Model } from '@earendil-works/pi-ai'

/** What an `afterRun` hook sees: the agent, the model it ran on, and how the run turned out. */
export interface AfterRunContext {
  agent: Agent
  model: Model<Api>
  outcome: AfterRunOutcome
}

/** One Alpha plugin: a name and the hook faces it contributes. */
export interface AlphaPlugin {
  name: string
  tools?: () => AgentTool[]
  beforeToolCall?: BeforeToolCallHook
  afterRun?: (context: AfterRunContext) => Promise<Undef<AfterRunVerdict>>
}
