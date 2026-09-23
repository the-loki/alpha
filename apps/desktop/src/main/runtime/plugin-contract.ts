/**
 * The plugin contract Alpha assembles its agent from (ADR-0025): a name plus up to three hook
 * faces. The base composes every face into the one pi `Agent` — tools concatenate in assembly
 * order, `beforeToolCall` chains in that order with the first block winning, and `afterRun`
 * observes a finished run and may ask the base to retry it. The contract is Alpha's own: no
 * external files, no loader, no re-implementation of coding-agent's extension format.
 */

import type { Undef } from '@alpha/domain'
import type { Agent, AgentTool } from '@earendil-works/pi-agent-core'
import type { Api, Model } from '@earendil-works/pi-ai'

/** One pending tool call a `beforeToolCall` hook is asked about. */
export interface PluginToolCall {
  toolCallId: string
  toolName: string
  args: unknown
}

/** A hook's answer about one tool call: a block carries the reason the model reads. */
export interface ToolBlock {
  reason: string
}

export interface ToolVerdict {
  block?: ToolBlock
}

/** How the run that just ended turned out. */
export interface AfterRunOutcome {
  /** The failure the run ended with, when it failed; an abort is not a failure. */
  failed: Undef<string>
  aborted: boolean
}

/** What an `afterRun` hook sees: the agent, the model it ran on, and how the run turned out. */
export interface AfterRunContext {
  agent: Agent
  model: Model<Api>
  outcome: AfterRunOutcome
}

export interface AfterRunVerdict {
  /** Ask the base to continue the agent once the run settles. Ignored for an aborted run. */
  retry?: boolean
}

/** One Alpha plugin: a name and the hook faces it contributes. */
export interface AlphaPlugin {
  name: string
  tools?: () => AgentTool[]
  beforeToolCall?: (call: PluginToolCall) => Promise<Undef<ToolVerdict>>
  afterRun?: (context: AfterRunContext) => Promise<Undef<AfterRunVerdict>>
}

/**
 * The retry policy's pure decision — a failure, no abort, attempts to spend — consulted wherever a
 * run's end is being judged: by the hook that takes an attempt, and by the translator that decides
 * whether an ended run is over at all.
 */
export interface RetryDecider {
  shouldRetry(outcome: AfterRunOutcome): boolean
}
