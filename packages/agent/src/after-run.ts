/**
 * The `afterRun` face, driven by the base: wait the run out, hand the outcome to the hooks' chain,
 * and when the chain answers a retry, let the agent continue. What the chain is — every hook asked
 * in assembly order, any retry asking enough, an abort never one — is `@alpha/plugin`'s rule; what
 * stays here is the part that needs pi: reading the outcome off the transcript, dropping the failed
 * turn, and driving the agent again. The retry loop lives here so no caller re-implements it; a hook
 * that always retries loops forever, so capping attempts is the auto-retry plugin's own business.
 */

import type { Undef } from '@alpha/domain'
import { type AfterRunHook, type AfterRunOutcome, chainAfterRunVerdicts } from '@alpha/plugin'
import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { failureOf } from './failure.ts'
import type { AlphaPlugin } from './plugin-contract.ts'

/** The transcript's last assistant message, or nothing when the run never produced one. */
function lastAssistant(messages: AgentMessage[]): Undef<AssistantMessage> {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant') return message
  }
  return undefined
}

/**
 * How the finished run turned out, read off the message that ended it: an abort is not a failure,
 * and the failure is whatever that message carries — the same reading the window is given, since
 * `failureOf` is the one reader of it. pi's own `state.errorMessage` is not asked: it holds a
 * sentence only when there was one, which is exactly how a silent failure came to be neither
 * retried nor reported.
 */
function outcomeOf(agent: Agent): AfterRunOutcome {
  const last = lastAssistant(agent.state.messages)
  const aborted = last?.stopReason === 'aborted'
  return { failed: aborted ? undefined : failureOf(last), aborted }
}

/**
 * `continue()` refuses a transcript that ends in an assistant message, and a failed run ends in
 * exactly that. The failed turn produced nothing the model reads, so the retry drops it and
 * continues from what came before.
 */
function dropFailedTurn(agent: Agent): void {
  const messages = agent.state.messages.slice()
  while (messages.at(-1)?.role === 'assistant') messages.pop()
  agent.state.messages = messages
}

/** The hooks the assembled plugins contribute, read per run the way the tool chain reads its own. */
function hooksOf(plugins: AlphaPlugin[]): AfterRunHook[] {
  return plugins.flatMap((plugin) => (plugin.afterRun === undefined ? [] : [plugin.afterRun]))
}

/** Waits the current run out, then asks the plugins' `afterRun` chain, retrying on its answer. */
export async function runAfterRunHooks(
  agent: Agent,
  plugins: AlphaPlugin[],
  onRetry?: () => void,
): Promise<AfterRunOutcome> {
  await agent.waitForIdle()
  for (;;) {
    const outcome = outcomeOf(agent)
    const verdict = await chainAfterRunVerdicts(hooksOf(plugins))(outcome)
    if (verdict?.retry !== true) return outcome
    onRetry?.()
    dropFailedTurn(agent)
    await agent.continue()
  }
}
