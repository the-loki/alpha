import type { ProviderTestOutcome } from '@alpha/contract'
import { refusalText, type Say } from './refusal-text.ts'

export function providerTestText(say: Say, outcome: ProviderTestOutcome): string {
  if (outcome.ok) return outcome.said
  if ('refusal' in outcome) return refusalText(say, outcome.refusal)
  switch (outcome.failure.kind) {
    case 'timeout':
      return say('settings.testTimeout', { seconds: outcome.failure.seconds })
    case 'request-failed':
      return outcome.failure.said === undefined
        ? say('settings.testRequestFailed')
        : say('settings.testRequestFailedSaid', { said: outcome.failure.said })
    case 'provider-error':
      return say('settings.testProviderError', { said: outcome.failure.said })
    case 'empty-answer':
      return say('settings.testEmptyAnswer')
  }
}
