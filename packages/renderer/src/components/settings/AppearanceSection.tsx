import {
  ACCENTS,
  type Accent,
  LANGUAGE_SETTINGS,
  type LanguageSetting,
  type TextKey,
  THEMES,
  type Theme,
} from '@alpha/core'
import { useShell, useText } from '../../stores/shell.ts'
import { CheckIcon } from '../icons.tsx'

const THEME_LABELS: Record<Theme, TextKey> = {
  system: 'settings.themeSystem',
  dark: 'settings.themeDark',
  light: 'settings.themeLight',
}

/**
 * A language is always listed in itself: someone who cannot read the interface they are looking at
 * is exactly the person looking for this row, and "Chinese" would not help them find it.
 */
const LANGUAGE_LABELS: Record<LanguageSetting, string> = {
  system: 'Follow the system',
  en: 'English',
  zh: '简体中文',
}

/** Not translated, for the same reason: a palette is named the same in every language. */
const ACCENT_LABELS: Record<Accent, string> = {
  ember: 'Ember',
  sage: 'Sage',
  iris: 'Iris',
  rose: 'Rose',
  plum: 'Plum',
}

const CHOICE = 'flex items-center gap-2 rounded-control border px-3 py-1.5 text-xs transition-colors'
const CHOSEN = 'border-accent/50 bg-accent/10 text-accent'
const RESTING = 'border-line text-parchment-dim hover:bg-ink-600'

/** How the workbench looks and reads: the palette, the accent, and the language. */
export function AppearanceSection() {
  const theme = useShell((state) => state.theme)
  const accent = useShell((state) => state.accent)
  const language = useShell((state) => state.language)
  const setAppearance = useShell((state) => state.setAppearance)
  const t = useText()

  return (
    <>
      <section aria-labelledby="settings-theme">
        <h2 id="settings-theme" className="text-body font-medium text-parchment">
          {t('settings.theme')}
        </h2>
        <p className="mt-1 text-xs text-parchment-dim">{t('settings.themeNote')}</p>
        <div className="mt-3 flex gap-2">
          {THEMES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === theme}
              onClick={() => void setAppearance({ theme: candidate })}
              className={`${CHOICE} ${candidate === theme ? CHOSEN : RESTING}`}
            >
              {candidate === theme && <CheckIcon />}
              {t(THEME_LABELS[candidate])}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="settings-accent">
        <h2 id="settings-accent" className="text-body font-medium text-parchment">
          {t('settings.accent')}
        </h2>
        <p className="mt-1 text-xs text-parchment-dim">{t('settings.accentNote')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ACCENTS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === accent}
              onClick={() => void setAppearance({ accent: candidate })}
              className={`${CHOICE} py-1.5 pr-3 pl-2 ${
                candidate === accent ? 'border-line-strong bg-ink-600 font-medium text-parchment' : RESTING
              }`}
            >
              {/* The swatch wears the accent it names, in the mode the workbench is in, so the
                  choice shows what it changes instead of describing it. */}
              <span
                aria-hidden="true"
                data-accent-swatch={candidate}
                data-accent={candidate}
                className="h-3.5 w-3.5 rounded-full border border-line-strong/40 bg-accent"
              />
              {ACCENT_LABELS[candidate]}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="settings-language">
        <h2 id="settings-language" className="text-body font-medium text-parchment">
          {t('settings.language')}
        </h2>
        <p className="mt-1 text-xs text-parchment-dim">{t('settings.languageNote')}</p>
        <div className="mt-3 flex gap-2">
          {LANGUAGE_SETTINGS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === language}
              onClick={() => void setAppearance({ language: candidate })}
              className={`${CHOICE} ${candidate === language ? CHOSEN : RESTING}`}
            >
              {candidate === language && <CheckIcon />}
              {LANGUAGE_LABELS[candidate]}
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
