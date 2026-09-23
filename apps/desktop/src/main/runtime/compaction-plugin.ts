/**
 * The compaction plugin (ADR-0025): coding-agent's policy on Alpha's base. After a run that was
 * not aborted, the context is estimated from the assistant usage the transcript carries; when it
 * nears the model's window — reserve and keep-recent tokens — the messages beyond the kept tail
 * are summarized through the model, the live agent is rewritten around the summary, the store
 * takes a compaction entry naming where keeping begins, and the window hears `history_compacted`
 * through a port the runtime owns. Compacting by hand runs the same path, threshold aside.
 *
 * Everything about the conversation is read at the moment of compacting — the agent, the model,
 * the session id — because all three move under a long-lived conversation: a model swap takes
 * effect on the next turn, and a fork moves the session the store writes into.
 */

import type { Undef } from '@alpha/domain'
import { type SessionStore, tipPath } from '@alpha/sessions'
import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core'
import {
  type CompactionSettings,
  calculateContextTokens,
  DEFAULT_COMPACTION_SETTINGS,
  estimateTokens,
  generateSummaryWithUsage,
  shouldCompact,
} from '@earendil-works/pi-agent-core'
import { BACKGROUND_CONTEXT } from '@earendil-works/pi-agent-core/harness/context'
import type { Api, Model, Models } from '@earendil-works/pi-ai'
import { alignedHistoryOf } from './agent-context.ts'
import type { AlphaPlugin } from './plugin-contract.ts'

/** What the plugin needs. The getters are read per compaction, never captured. */
export interface CompactionPluginPorts {
  conversationId: string
  workspacePath: string
  /** The session the conversation is on now: a fork moves it, and the entry follows the fork. */
  sessionId: () => string
  store: SessionStore
  models: Models
  /** The live agent, whose messages are summarized and rewritten. */
  agent: () => Undef<Agent>
  /** The model to measure against and to summarize with. */
  model: () => Undef<Model<Api>>
  /** How the announcement reaches the runtime, which owns the window's emit. */
  onCompacted: (compacted: { summary: string; replaced: number; at: number }) => void
  settings?: CompactionSettings
}

/** The plugin plus the on-demand path the runtime's `compact()` calls. */
export interface CompactionPlugin extends AlphaPlugin {
  compact(): Promise<boolean>
}

/** The context the transcript says it occupies: the largest assistant usage seen. */
function tokensOf(messages: AgentMessage[]): number {
  let largest = 0
  for (const message of messages) {
    if (message.role !== 'assistant' || message.usage === undefined) continue
    largest = Math.max(largest, calculateContextTokens(message.usage))
  }
  return largest
}

/** How many trailing messages fit in the tokens the settings keep — the tail a summary leaves. */
function keptCountOf(messages: AgentMessage[], keepRecentTokens: number): number {
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

export function createCompactionPlugin(ports: CompactionPluginPorts): CompactionPlugin {
  const settings = ports.settings ?? DEFAULT_COMPACTION_SETTINGS
  return {
    name: 'compaction',
    afterRun: async (outcome) => {
      if (outcome.aborted) return undefined
      await compactNow(ports, settings, false)
      return undefined
    },
    compact: () => compactNow(ports, settings, true),
  }
}

/** The summary the model writes for the messages being folded away. */
function summarizeWith(
  ports: CompactionPluginPorts,
  settings: CompactionSettings,
  agent: Agent,
  model: Model<Api>,
  summarized: AgentMessage[],
) {
  return generateSummaryWithUsage(
    summarized,
    ports.models,
    model,
    settings.reserveTokens,
    undefined,
    undefined,
    agent.state.thinkingLevel,
    undefined,
    undefined,
    BACKGROUND_CONTEXT,
  )
}

/** Where keeping begins on the store's path, so a reopen folds the way the live agent was rewritten. */
function firstKeptEntryIdOf(ports: CompactionPluginPorts, kept: number): Undef<string> {
  if (kept === 0) return undefined
  const read = ports.store.entries(ports.sessionId(), ports.workspacePath)
  const aligned = alignedHistoryOf(tipPath(read.entries, read.leafId))
  const at = aligned.messages.length - kept
  return at < 0 ? undefined : aligned.entryIds[at]
}

/** Rewrites the live agent around the summary and answers the first entry the tail keeps. */
function rewriteAgent(
  ports: CompactionPluginPorts,
  agent: Agent,
  summary: string,
  kept: AgentMessage[],
): Undef<string> {
  const summaryMessage: AgentMessage = {
    role: 'user',
    content: [{ type: 'text', text: summary }],
    timestamp: Date.now(),
  }
  const system = agent.state.messages.find((message) => message.role === 'system')
  agent.state.messages = system === undefined ? [summaryMessage, ...kept] : [system, summaryMessage, ...kept]
  return firstKeptEntryIdOf(ports, kept.length)
}

/** The one compaction path: measure, summarize, rewrite, persist, announce. */
async function compactNow(
  ports: CompactionPluginPorts,
  settings: CompactionSettings,
  force: boolean,
): Promise<boolean> {
  const agent = ports.agent()
  const model = ports.model()
  if (agent === undefined || model === undefined) return false
  if (!force && !shouldCompact(tokensOf(agent.state.messages), model.contextWindow, settings)) return false
  const body = messagesOf(agent)
  const kept = keptCountOf(body, settings.keepRecentTokens)
  const summarized = body.slice(0, body.length - kept)
  if (summarized.length === 0) return false
  const summary = await summarizeWith(ports, settings, agent, model, summarized)
  if (!summary.ok) return false
  const firstKept = rewriteAgent(ports, agent, summary.value.text, body.slice(body.length - kept))
  ports.store.compact({
    sessionId: ports.sessionId(),
    workspacePath: ports.workspacePath,
    summary: summary.value.text,
    ...(firstKept === undefined ? {} : { firstKeptEntryId: firstKept }),
  })
  ports.onCompacted({ summary: summary.value.text, replaced: summarized.length, at: Date.now() })
  return true
}

/** The messages past the system prompt: what the summary stands in for, and what it leaves. */
function messagesOf(agent: Agent): AgentMessage[] {
  const messages = agent.state.messages
  return messages[0]?.role === 'system' ? messages.slice(1) : messages
}
