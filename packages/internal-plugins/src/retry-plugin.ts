/**
 * The auto-retry plugin (ADR-0025): coding-agent's design for a transient provider failure, as a
 * face on the plugin base. The decision is pure and inspectable — a failure, no abort, attempts to
 * spend — and `afterRun` is the only place an attempt is taken: it sleeps this attempt's backoff
 * and asks the base to continue, which drops the failed trailing turn and drives again. A run that
 * ends without a retry hands the next one a whole budget.
 *
 * The same decision keeps the window honest: the translator consults `shouldRetry` when an
 * `agent_end` arrives carrying a failure, and leaves the turn open while an attempt is planned.
 * The decision decides and the hook acts — and nothing is written between the two.
 *
 * Nothing here names pi: the face is `@alpha/plugin`'s, so auto-retry is a library's business like
 * the policy it wraps (C2.8), and `main` keeps only the registration.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import type { AfterRunHook, RetryDecider } from '@alpha/plugin'

/** How the plugin waits: one delay per retry, in order. coding-agent's two retries. */
export interface RetryPluginPorts {
  delays?: number[]
}

/** The plugin, which is the pure decision the run's end is judged with. */
export interface RetryPlugin extends RetryDecider {
  name: string
  afterRun: AfterRunHook
}

const DEFAULT_DELAYS = [2000, 8000]

export function createRetryPlugin(ports: RetryPluginPorts = {}): RetryPlugin {
  const delays = ports.delays ?? DEFAULT_DELAYS
  let attempts = 0
  const plugin: RetryPlugin = {
    name: 'auto-retry',
    shouldRetry: (outcome) => outcome.aborted === false && outcome.failed !== undefined && attempts < delays.length,
    afterRun: async (outcome, signal) => {
      if (!plugin.shouldRetry(outcome)) {
        // The run is over and took no retry: whatever failures came before it are paid for.
        attempts = 0
        return undefined
      }
      try {
        await sleep(delays[attempts] ?? 0, undefined, signal === undefined ? undefined : { signal })
      } catch (error) {
        if (!signal?.aborted) throw error
      }
      if (signal?.aborted) {
        attempts = 0
        return undefined
      }
      attempts += 1
      return { retry: true }
    },
  }
  return plugin
}
