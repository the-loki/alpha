/**
 * A refusal's sentence, from the dictionary. Main answers which refusal it was; this says it in the
 * language the window is in, because the window is the thing with a language (ADR-0010). A sentence
 * composed in the main process arrived in English whatever language the window was in, which is what
 * the case-not-a-sentence split is for.
 */
import type { TurnRefusal } from '@alpha/domain'
import type { TextKey, TextParams } from '@alpha/i18n'

/** How a component asks the dictionary for a line, which is what `useText` hands it. */
export type Say = (key: TextKey, params?: TextParams) => string

/**
 * The sentence for one case, with the names the case carries. Every case is answered here, so a new
 * one cannot reach the window without words: the compiler asks for the sentence the moment the case
 * exists.
 */
export function refusalText(say: Say, refusal: TurnRefusal): string {
  switch (refusal.kind) {
    case 'no-model':
      return say('refusal.noModel')
    case 'model-not-served':
      return say('refusal.modelNotServed', { provider: refusal.providerId, model: refusal.modelId })
    case 'no-provider':
      return say('refusal.noProvider', { provider: refusal.providerId })
    case 'key-unreadable':
      return say('refusal.keyUnreadable', { provider: refusal.providerId })
    case 'no-key':
      return say('refusal.noKey', { provider: refusal.providerId })
    case 'pictures':
      return say('refusal.pictures', { model: refusal.model })
  }
}
