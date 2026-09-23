/**
 * The interface's words, in the two languages it is written in.
 *
 * Chrome only. Two other kinds of string are deliberately not here: what the agent is told (a
 * permission refusal, the reason a tool was blocked) is part of the conversation and is read by
 * the model, so it stays in the language the conversation is in; and anything a vendor or the
 * operating system said is quoted rather than translated.
 *
 * The dictionary is data, not code: a translator can read it, and the compiler checks that every
 * key in `EN` has an answer in `ZH`. Plurals are separate keys rather than a plural rule, because
 * the two languages here disagree about what a plural even is and one `{count}` hole cannot say
 * both. `docs/adr/0010` is the decision; this file is the whole of the interface's copy.
 */

export const LANGUAGES = ['en', 'zh'] as const

export type Language = (typeof LANGUAGES)[number]

/** What the setting may say: one of the languages, or "whichever the machine is in". */
export const LANGUAGE_SETTINGS = ['system', ...LANGUAGES] as const

export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number]

export const DEFAULT_LANGUAGE: LanguageSetting = 'system'

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return typeof value === 'string' && (LANGUAGE_SETTINGS as readonly string[]).includes(value)
}

/** Values for the `{name}` holes in a line. */
export type TextParams = Record<string, string | number>

import { EN } from './en.ts'
import { ZH } from './zh.ts'

export type TextKey = keyof typeof EN

export { EN, ZH }

const DICTIONARIES: Record<Language, Record<TextKey, string>> = { en: EN, zh: ZH }

/**
 * A line of the interface, with its holes filled. A hole with no value is left standing as
 * `{name}`: a visibly unfilled placeholder is a bug report, an empty gap is a mystery.
 */
export function text(language: Language, key: TextKey, params: TextParams = {}): string {
  const line = DICTIONARIES[language][key]
  return line.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name]
    return value === undefined ? whole : String(value)
  })
}

/**
 * How many conversations there are, said properly. The one rule the dictionary cannot carry is
 * which of its two keys a count wants, and it is written once here rather than at every caller.
 */
export function conversationCount(language: Language, count: number): string {
  return count === 1 ? text(language, 'sidebar.oneConversation') : text(language, 'sidebar.conversations', { count })
}

/**
 * Which of the two languages a client is showing. `system` asks the machine (the browser's or the
 * desktop's — either way it is the language the person reading is sitting in), and a machine whose
 * language this interface does not have gets English: a dictionary is all-or-nothing, and half of
 * one reads worse than a language you did not pick, which settings can fix in a click.
 */
export function resolveLanguage(setting: LanguageSetting, systemLanguage: string): Language {
  if (setting !== 'system') return setting
  return systemLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
