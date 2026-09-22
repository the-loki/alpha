/**
 * The auto-retry plugin (ADR-0025): coding-agent's design for a transient provider failure,
 * adapted to Alpha's base. The decision is pure and inspectable — a failure, no abort, attempts
 * to spend — and `afterRun` is the only place an attempt is taken: it sleeps this attempt's
 * backoff and asks the base to continue, which drops the failed trailing turn and drives again.
 * A run that ends without a retry hands the next one a whole budget.
 *
 * The same decision keeps the window honest: the translator consults `shouldRetry` when an
 * `agent_end` arrives carrying a failure, and leaves the turn open while an attempt is planned.
 * The decision decides and the hook acts — and nothing is written between the two.
 */

import type { AlphaPlugin, RetryDecider } from './plugin-contract.ts'

/** How the plugin waits: one delay per retry, in order. coding-agent's two retries. */
export interface RetryPluginPorts {
  delays?: number[]
}

/** The plugin, which is the pure decision the run's end is judged with. */
export interface RetryPlugin extends AlphaPlugin, RetryDecider {}

const DEFAULT_DELAYS = [2000, 8000]

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
