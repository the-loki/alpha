import { describe, expect, it } from 'vitest'
import { failureOf } from './failure.ts'

/**
 * The one reading of a run's failure. Both ends of a run depend on it — the window's `run_failed`
 * carries what was read, and the retry policy is asked about exactly that — so the rule is pinned
 * here rather than only through the two callers.
 *
 * Whether a run failed and what it said are two answers and the failure carries both: a provider
 * that erred without a sentence is a failed run that said nothing, not a run that did not fail, and
 * the sentence for that case belongs to the window — in the language the window is in (ADR-0010).
 */
describe('[agent] the failure a message carries', () => {
  it('carries what the failed message said', () => {
    expect(failureOf({ role: 'assistant', stopReason: 'error', errorMessage: 'the provider hung up' })).toEqual({
      message: 'the provider hung up',
    })
  })

  it('is a failure with nothing in it when the message had nothing to say', () => {
    expect(failureOf({ role: 'assistant', stopReason: 'error', errorMessage: '' })).toEqual({})
    expect(failureOf({ role: 'assistant', stopReason: 'error' })).toEqual({})
  })

  it('reads an abort, a finished turn, and a tool result as no failure', () => {
    expect(failureOf({ role: 'assistant', stopReason: 'aborted', errorMessage: 'stopped' })).toBeUndefined()
    expect(failureOf({ role: 'assistant', stopReason: 'stop' })).toBeUndefined()
    expect(failureOf({ role: 'toolResult', stopReason: 'error' })).toBeUndefined()
    expect(failureOf(undefined)).toBeUndefined()
  })
})
