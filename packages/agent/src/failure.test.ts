import { describe, expect, it } from 'vitest'
import { failureOf, RUN_FAILED } from './failure.ts'

/**
 * The one reading of a run's failure. Both ends of a run depend on it — the window's `run_failed`
 * carries this sentence, and the retry policy is asked about exactly what was said — so the rule
 * is pinned here rather than only through the two callers.
 */
describe('[agent] the failure a message carries', () => {
  it('says what the failed message said', () => {
    expect(failureOf({ role: 'assistant', stopReason: 'error', errorMessage: 'the provider hung up' })).toBe(
      'the provider hung up',
    )
  })

  it('says a run failed even when the message had nothing to say', () => {
    // A provider that errs with an empty message is still a failed run: the default is what both
    // the window and the retry policy read, and reading it as "no failure" is what left a turn
    // neither retried nor reported.
    expect(failureOf({ role: 'assistant', stopReason: 'error', errorMessage: '' })).toBe(RUN_FAILED)
    expect(failureOf({ role: 'assistant', stopReason: 'error' })).toBe(RUN_FAILED)
  })

  it('reads an abort, a finished turn, and a tool result as no failure', () => {
    expect(failureOf({ role: 'assistant', stopReason: 'aborted', errorMessage: 'stopped' })).toBeUndefined()
    expect(failureOf({ role: 'assistant', stopReason: 'stop' })).toBeUndefined()
    expect(failureOf({ role: 'toolResult', stopReason: 'error' })).toBeUndefined()
    expect(failureOf(undefined)).toBeUndefined()
  })
})
