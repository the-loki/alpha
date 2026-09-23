import { describe, expect, it } from 'vitest'
import {
  conversationCount,
  DEFAULT_LANGUAGE,
  EN,
  isLanguageSetting,
  LANGUAGES,
  type Language,
  resolveLanguage,
  type TextKey,
  text,
  ZH,
} from './i18n.ts'
import { PROVIDER_APIS, type ProviderApi } from './providers.ts'

describe('[core] the dictionary', () => {
  it('answers every key in every language', () => {
    // The compiler already refuses a dictionary that is missing a key; this catches the other
    // direction, a key added to one language's map and never written down in the other.
    expect(Object.keys(ZH).sort()).toEqual(Object.keys(EN).sort())
  })

  it('holds prose, not empty strings', () => {
    for (const dictionary of [EN, ZH]) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.length, key).toBeGreaterThan(0)
      }
    }
  })
})

describe('[core] text', () => {
  it('reads the key in the language it was asked for', () => {
    expect(text('en', 'sidebar.search')).toBe('Search')
    expect(text('zh', 'sidebar.search')).toBe('搜索')
  })

  it('fills the holes it is given a value for', () => {
    expect(text('en', 'sidebar.newConversationIn', { folder: 'alpha' })).toBe('in alpha')
    expect(text('zh', 'sidebar.newConversationIn', { folder: 'alpha' })).toBe('在 alpha')
  })

  it('leaves a hole standing when no value was given', () => {
    // A missing value shows as `{folder}` rather than as nothing: an empty gap in a sentence is
    // harder to notice than a placeholder, and this is the shape a bug takes.
    expect(text('en', 'sidebar.newConversationIn')).toBe('in {folder}')
  })

  it('numbers a hole the same whether it is given a number or a string', () => {
    expect(text('en', 'sidebar.conversations', { count: 2 })).toBe('2 conversations')
    expect(text('zh', 'sidebar.conversations', { count: 2 })).toBe('2 个会话')
    expect(text('en', 'sidebar.conversations', { count: '2' })).toBe('2 conversations')
  })
})

describe('[core] what the protocol copy has to say', () => {
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

describe('[core] saying how many conversations there are', () => {
  it('uses the singular for one and the plural for the rest', () => {
    expect(conversationCount('en', 1)).toBe('1 conversation')
    expect(conversationCount('en', 0)).toBe('0 conversations')
    expect(conversationCount('en', 3)).toBe('3 conversations')
  })

  it('says it in the language it was asked for', () => {
    expect(conversationCount('zh', 3)).toBe('3 个会话')
  })
})

describe('[core] resolveLanguage', () => {
  it('follows the machine when the setting says to', () => {
    expect(resolveLanguage('system', 'zh-CN')).toBe('zh')
    expect(resolveLanguage('system', 'zh-Hant-TW')).toBe('zh')
    expect(resolveLanguage('system', 'en-GB')).toBe('en')
  })

  it('shows English for a machine whose language it does not have', () => {
    // French is not a language this interface is written in, and half a dictionary is worse than
    // a language the user may not prefer: they can choose one in settings.
    expect(resolveLanguage('system', 'fr-FR')).toBe('en')
    expect(resolveLanguage('system', '')).toBe('en')
  })

  it('lets an explicit choice win over the machine', () => {
    expect(resolveLanguage('zh', 'en-US')).toBe('zh')
    expect(resolveLanguage('en', 'zh-CN')).toBe('en')
  })

  it('knows the languages it has, and the setting it keeps', () => {
    expect(LANGUAGES).toEqual(['en', 'zh'])
    expect(DEFAULT_LANGUAGE).toBe('system')
    expect(isLanguageSetting('zh')).toBe(true)
    expect(isLanguageSetting('system')).toBe(true)
    expect(isLanguageSetting('de')).toBe(false)
    expect(isLanguageSetting(undefined)).toBe(false)
  })

  it('hands back a language of the two it has, whatever it is given', () => {
    const resolved: Language[] = LANGUAGES.map((language) => resolveLanguage(language, 'fr-FR'))
    expect(resolved).toHaveLength(2)
  })
})
