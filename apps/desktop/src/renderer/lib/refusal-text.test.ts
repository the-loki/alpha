import type { TurnRefusal } from '@alpha/domain'
import { LANGUAGES, type Language, type TextKey, type TextParams, text } from '@alpha/i18n'
import { describe, expect, it } from 'vitest'
import { refusalText } from './refusal-text.ts'

/** How the window asks for a sentence, which is what `useText` hands a component. */
const sayIn = (language: Language) => (key: TextKey, params?: TextParams) => text(language, key, params)

/** Every case a refusal can be, with the names each one carries. */
const CASES: TurnRefusal[] = [
  { kind: 'no-model' },
  { kind: 'model-not-served', providerId: 'local', modelId: 'ghost' },
  { kind: 'no-provider', providerId: 'local' },
  { kind: 'key-unreadable', providerId: 'local' },
  { kind: 'no-key', providerId: 'local' },
  { kind: 'pictures', model: 'Local 7B' },
]

describe('[renderer] the words for a refusal', () => {
  it('has a sentence for every case, in both languages', () => {
    for (const refusal of CASES) {
      for (const language of LANGUAGES) {
        const said = refusalText(sayIn(language), refusal)
        expect(said, `${language} ${refusal.kind}`).not.toBe('')
        // A hole standing in the text is a missing name, not a sentence: the dictionary leaves
        // `{model}` visible when nobody filled it.
        expect(said, `${language} ${refusal.kind}`).not.toContain('{')
      }
    }
  })

  it('names the model and the provider the case is about, so the sentence can point at the setting', () => {
    const said = (refusal: TurnRefusal): string => refusalText(sayIn('en'), refusal)

    expect(said({ kind: 'model-not-served', providerId: 'local', modelId: 'ghost' })).toContain('ghost')
    expect(said({ kind: 'model-not-served', providerId: 'local', modelId: 'ghost' })).toContain('local')
    expect(said({ kind: 'no-key', providerId: 'local' })).toContain('local')
    expect(said({ kind: 'pictures', model: 'Local 7B' })).toContain('Local 7B')
  })

  it('is the window’s language and not the main process’s', () => {
    // The whole point of the case: a sentence composed in main arrived in English whatever language
    // the window was in. The same case read twice is two sentences, and the Chinese one is Chinese.
    const en = refusalText(sayIn('en'), { kind: 'no-model' })
    const zh = refusalText(sayIn('zh'), { kind: 'no-model' })

    expect(zh).not.toBe(en)
    expect(zh).toMatch(/[\u4e00-\u9fff]/)
    expect(en).not.toMatch(/[\u4e00-\u9fff]/)
  })
})
