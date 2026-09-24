/**
 * The failure a message carries, when it is the one that ended a run. pi has no failure event of
 * its own: the run's end is read off the last assistant message, and *this* is the one reader of
 * it. Two readers is how the window and the retry policy come to disagree about whether a run is
 * over — the runtime says `run_failed` with this sentence, and the policy is asked about exactly
 * what was said — so there is one function, and both ends of the run call it.
 */

import { recordOf, type Undef } from '@alpha/domain'

/** What a run says when it failed and its message carries no sentence of its own. */
export const RUN_FAILED = 'The run failed.'

/** The failure this message carries, or nothing when the message did not fail. */
export function failureOf(message: unknown): Undef<string> {
  const failed = recordOf(message)
  if (failed.role !== 'assistant' || failed.stopReason !== 'error') return undefined
  return typeof failed.errorMessage === 'string' && failed.errorMessage !== '' ? failed.errorMessage : RUN_FAILED
}
