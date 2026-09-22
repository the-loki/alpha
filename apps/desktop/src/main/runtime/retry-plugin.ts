/**
 * The auto-retry plugin (ADR-0025): coding-agent's design for a transient provider failure,
 * adapted to Alpha's base. The decision is pure and inspectable — a failure, no abort, attempts
 * to spend — and `afterRun` is the only place an attempt is taken: it sleeps this attempt's
 * backoff and asks the base to continue, which drops the failed trailing turn and drives again.
 * A run that ends without a retry hands the next one a whole budget.
 *
 * The same decision keeps the window honest: the runtime reads `shouldRetry` when an `agent_end`
 * arrives carrying a failure, and marks the event `willRetry` so the translator leaves the turn
 * open. The annotation decides nothing and counts nothing — afterRun still owns the attempt.
 */

import type { Undef } from '@alpha/core'
import type { RpcLikeEvent } from './agent-events.ts'
import type { AfterRunOutcome, AlphaPlugin } from './plugin-contract.ts'

/** How the plugin waits: one delay per retry, in order. coding-agent's two retries. */
export interface RetryPluginPorts {
  delays?: number[]
}

/** The plugin plus the pure decision the runtime consults when annotating an `agent_end`. */
export interface RetryPlugin extends AlphaPlugin {
  shouldRetry(outcome: AfterRunOutcome): boolean
}

const DEFAULT_DELAYS = [2000, 8000]

/** The failure a raw `agent_end` carries, when its last message is an assistant one that erred. */
export function failedMessageOf(event: RpcLikeEvent): Undef<string> {
  if (event.type !== 'agent_end' || !Array.isArray(event.messages)) return undefined
  const last = event.messages.at(-1)
  if (typeof last !== 'object' || last === null) return undefined
  const message = last as { role?: unknown; stopReason?: unknown; errorMessage?: unknown }
  if (message.role !== 'assistant' || message.stopReason !== 'error') return undefined
  return typeof message.errorMessage === 'string' && message.errorMessage !== ''
    ? message.errorMessage
    : 'The run failed.'
}

const sleep = (milliseconds: number): Promise<void> => new Promise((done) => setTimeout(done, milliseconds))

export function createRetryPlugin(ports: RetryPluginPorts = {}): RetryPlugin {
  const delays = ports.delays ?? DEFAULT_DELAYS
  let attempts = 0
  const plugin: RetryPlugin = {
    name: 'auto-retry',
    shouldRetry: (outcome) => outcome.aborted === false && outcome.failed !== undefined && attempts < delays.length,
    afterRun: async (context) => {
      if (!plugin.shouldRetry(context.outcome)) {
        // The run is over and took no retry: whatever failures came before it are paid for.
        attempts = 0
        return undefined
      }
      await sleep(delays[attempts] ?? 0)
      attempts += 1
      return { retry: true }
    },
  }
  return plugin
}
