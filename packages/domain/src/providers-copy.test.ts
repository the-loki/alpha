/**
 * What the dictionary has to say about each wire, checked where the wire list lives.
 *
 * The dictionary is dependency-free on purpose — testing it should need nothing present — so the
 * one thing that needs both halves (the copy, and the protocols `PROVIDER_APIS` declares) is
 * asserted from this side, by whichever layer knows about the protocols.
 */

import { LANGUAGES, type TextKey, text } from '@alpha/i18n'
import { describe, expect, it } from 'vitest'
import { PROVIDER_APIS, type ProviderApi } from './providers.ts'

/** The path each wire is called at under the base url, which is what decides what to type. */
const PATHS: Record<ProviderApi, string> = {
  'openai-completions': '/chat/completions',
  'openai-responses': '/responses',
  'anthropic-messages': '/v1/messages',
}

const NOTES: Record<ProviderApi, TextKey> = {
  'openai-completions': 'settings.apiOpenaiNote',
  'openai-responses': 'settings.apiResponsesNote',
  'anthropic-messages': 'settings.apiAnthropicNote',
}

describe('[domain] what the protocol copy has to say', () => {
  /**
   * The protocol picker decides how the base url is read, and a person cannot see the path their
   * client appends — the Anthropic one adds /v1/messages itself, so a base url ending in /v1
   * reaches /v1/v1/messages and a 404. The line under each choice is where that is said.
   */
  it('names the path each wire is called at, in both languages', () => {
    for (const api of PROVIDER_APIS) {
      expect(text('en', NOTES[api]), api).toContain(PATHS[api])
      expect(text('zh', NOTES[api]), api).toContain(PATHS[api])
    }
  })

  /**
   * And where the version segment goes, because it is the half that decides what a person types:
   * the two OpenAI-shaped clients append only the resource, so /v1 is theirs to write — and the
   * Anthropic one has it already. A note that named the path and stopped there would leave the
   * silent 404 in place.
   */
  it('says the version segment belongs to the base url, on the wires that append only a resource', () => {
    for (const api of ['openai-completions', 'openai-responses'] as const) {
      for (const language of LANGUAGES) expect(text(language, NOTES[api]), api).toContain('/v1')
    }
  })

  /**
   * The default key style is the wire's own header — x-api-key on the Anthropic wire,
   * Authorization on the OpenAI-shaped ones — so an option named after one wire's header is wrong
   * for the other two. The note is where both are named and the switch is explained.
   */
  it('keeps the default key style wire-neutral, and says where a key can ride', () => {
    for (const language of LANGUAGES) {
      expect(text(language, 'settings.authStyleApiKey')).not.toMatch(/x-api-key|Authorization/)
      expect(text(language, 'settings.authStyleNote')).toContain('x-api-key')
      expect(text(language, 'settings.authStyleNote')).toContain('Authorization: Bearer')
    }
  })
})
