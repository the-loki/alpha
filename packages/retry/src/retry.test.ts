import type { AfterRunOutcome } from '@alpha/plugin'
import { describe, expect, it } from 'vitest'
import { createRetryPlugin } from './retry.ts'

/**
 * coding-agent's auto-retry (ADR-0025) as a policy that stands on its own: a transient provider
 * failure, no abort, an attempt to spend, and the hook that spends it. What the base then does
 * with the answer — dropping the failed turn and driving the agent again — needs pi and is tested
 * where an agent exists.
 */

const FAILURE: AfterRunOutcome = { failed: 'the provider hung up', aborted: false }
const CLEAN: AfterRunOutcome = { failed: undefined, aborted: false }

describe('[retry] the decision', () => {
  it('a failure with attempts to spend retries; an abort and a clean run never do', () => {
    const plugin = createRetryPlugin({ delays: [0, 0] })
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
    expect(plugin.shouldRetry({ failed: 'stopped by the person', aborted: true })).toBe(false)
    expect(plugin.shouldRetry(CLEAN)).toBe(false)
  })

  it('is pure: asking it never spends an attempt', () => {
    const plugin = createRetryPlugin({ delays: [0] })
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
  })
})

describe('[retry] taking an attempt', () => {
  it('one delay is one retry, and the decision reads the same budget the hook spends', async () => {
    const plugin = createRetryPlugin({ delays: [0] })
    // Planned before the attempt is taken, so the translator can leave the turn open…
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
    expect(await plugin.afterRun(FAILURE)).toEqual({ retry: true })
    // …and spent after it, so the same question now answers no.
    expect(plugin.shouldRetry(FAILURE)).toBe(false)
    expect(await plugin.afterRun(FAILURE)).toBeUndefined()
  })

  it('waits this attempt’s backoff before it asks the base to continue', async () => {
    const plugin = createRetryPlugin({ delays: [30, 0] })
    const startedAt = Date.now()
    expect(await plugin.afterRun(FAILURE)).toEqual({ retry: true })
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25)
  })

  it('a run that ends without a retry hands the next one a whole budget', async () => {
    const plugin = createRetryPlugin({ delays: [0] })
    expect(await plugin.afterRun(FAILURE)).toEqual({ retry: true })
    expect(await plugin.afterRun(CLEAN)).toBeUndefined()
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
  })
})
