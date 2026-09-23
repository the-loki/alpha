/**
 * The compaction decision, stated so it can be read and tested without an agent: what a transcript
 * says it occupies (the largest usage an assistant message reported), how much of its tail a
 * summary leaves standing (the trailing messages a token budget pays for), and whether folding is
 * due (the window, less the room the summary itself needs).
 *
 * pi supplies the two measures — `calculateContextTokens` over a usage report, and a character
 * heuristic per message — and `shouldCompact` judges the first against the window. What the policy
 * adds is what Alpha folds: usage over estimates, and the tail counted from the end.
 */
import type { AgentMessage, CompactionSettings } from '@earendil-works/pi-agent-core'
import { calculateContextTokens, estimateTokens, shouldCompact } from '@earendil-works/pi-agent-core'

/** The context the transcript says it occupies: the largest assistant usage seen. */
export function tokensOf(messages: AgentMessage[]): number {
  let largest = 0
  for (const message of messages) {
    if (message.role !== 'assistant' || message.usage === undefined) continue
    largest = Math.max(largest, calculateContextTokens(message.usage))
  }
  return largest
}

/** How many trailing messages fit in the tokens the settings keep — the tail a summary leaves. */
export function keptCountOf(messages: AgentMessage[], keepRecentTokens: number): number {
  let kept = 0
  let tokens = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined) continue
    const cost = estimateTokens(message)
    if (tokens + cost > keepRecentTokens) break
    tokens += cost
    kept += 1
  }
  return kept
}

/** Whether the transcript has come close enough to the model's window that folding is due. */
export function compactionDue(messages: AgentMessage[], contextWindow: number, settings: CompactionSettings): boolean {
  return shouldCompact(tokensOf(messages), contextWindow, settings)
}
