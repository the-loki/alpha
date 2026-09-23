/**
 * The `afterRun` face, driven by the base: wait the run out, ask every hook in order how it
 * turned out, and when a hook asks for a retry on a run that was not aborted, let the agent
 * continue. The retry loop lives here so no caller re-implements it; a hook that always retries
 * loops forever, so capping attempts is the auto-retry plugin's own business.
 */

import type { Undef } from '@alpha/domain'
import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { AfterRunOutcome, AlphaPlugin } from './plugin-contract.ts'

/** The transcript's last assistant message, or nothing when the run never produced one. */
function lastAssistant(messages: AgentMessage[]): Undef<AssistantMessage> {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant') return message
  }
  return undefined
}

/** How the finished run turned out, read off the transcript: an abort is not a failure. */
function outcomeOf(agent: Agent): AfterRunOutcome {
  const aborted = lastAssistant(agent.state.messages)?.stopReason === 'aborted'
  return { failed: aborted ? undefined : agent.state.errorMessage, aborted }
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

/** Waits the current run out, then asks every plugin's `afterRun` hook, retrying on request. */
export async function runAfterRunHooks(agent: Agent, plugins: AlphaPlugin[]): Promise<void> {
  await agent.waitForIdle()
  for (;;) {
    const outcome = outcomeOf(agent)
    let retry = false
    for (const plugin of plugins) {
      const hook = plugin.afterRun
      if (hook === undefined) continue
      const verdict = await hook({ agent, model: agent.state.model, outcome })
      if (verdict?.retry === true) retry = true
    }
    if (!retry || outcome.aborted) return
    dropFailedTurn(agent)
    await agent.continue()
  }
}
