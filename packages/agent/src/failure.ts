/**
 * The failure a message carries, when it is the one that ended a run. pi has no failure event of
 * its own: the run's end is read off the last assistant message, and *this* is the one reader of
 * it. Two readers is how the window and the retry policy come to disagree about whether a run is
 * over — the runtime's `run_failed` carries what this read, and the policy is asked about exactly
 * that — so there is one function, and both ends of the run call it.
 *
 * Whether a run failed and what it said are two answers, and both come from here: a provider that
 * erred without a sentence is a failed run whose failure is empty, and the sentence for that case
 * is the window's to say, in the language the window is in (ADR-0010). This file used to write one
 * — "The run failed." — which meant the interface could not.
 */

import { recordOf, type Undef } from '@alpha/domain'
import type { RunFailure } from '@alpha/plugin'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { isRetryableAssistantError } from '@earendil-works/pi-ai/utils/retry'

/** The failure this message carries, or nothing when the message did not fail. */
export function failureOf(message: unknown): Undef<RunFailure> {
  const ended = recordOf(message)
  if (ended.role !== 'assistant' || ended.stopReason !== 'error') return undefined
  const said = ended.errorMessage
  // The classifier reads only stopReason and errorMessage, both checked above. The actual source
  // is pi's assistant message; the loose event reader also supplies those two fields in tests.
  return typeof said === 'string' && said !== ''
    ? { message: said, retryable: isRetryableAssistantError(message as AssistantMessage) }
    : {}
}
