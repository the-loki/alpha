import {
  ACCENTS,
  type Accent,
  LANGUAGE_SETTINGS,
  type LanguageSetting,
  type TextKey,
  THEMES,
  type Theme,
} from '@alpha/core'
import { For, Show } from 'solid-js'
import { shell, shellActions, useText } from '../../stores/shell.ts'
import { GROUP_LABEL } from '../controls.ts'
import { CheckIcon } from '../icons.tsx'

const THEME_LABELS: Record<Theme, TextKey> = {
  system: 'settings.themeSystem',
  dark: 'settings.themeDark',
  light: 'settings.themeLight',
}

/**
 * A language is always listed in itself: someone who cannot read the interface they are looking at
 * is exactly the person looking for this row, and "Chinese" would not help them find it. The
 * system option is not a language, so it alone goes through the dictionary.
 */
const LANGUAGE_LABELS: Record<LanguageSetting, { name?: string; key?: TextKey }> = {
  system: { key: 'settings.themeSystem' },
  en: { name: 'English' },
  zh: { name: '简体中文' },
}

/** Not translated, for the same reason: a palette is named the same in every language. */
const ACCENT_LABELS: Record<Accent, string> = {
  ember: 'Ember',
  sage: 'Sage',
  iris: 'Iris',
  rose: 'Rose',
  plum: 'Plum',
}

const CHOICE = 'flex h-7 items-center gap-2 rounded-control border px-3 text-xs transition-colors'
const CHOSEN = 'border-accent/50 bg-accent/10 text-accent'
const RESTING = 'border-line text-parchment-dim hover:bg-ink-600'

/** How the workbench looks and reads: the palette, the accent, and the language. */
export function AppearanceSection() {
  const t = useText()
  const labelOf = (candidate: LanguageSetting) => {
    const label = LANGUAGE_LABELS[candidate]
    return label.key === undefined ? (label.name ?? candidate) : t(label.key)
  }

  return (
    <>
      <section aria-labelledby="settings-theme">
        <h2 id="settings-theme" class={GROUP_LABEL}>
          {t('settings.theme')}
        </h2>
        <p class="mt-1 max-w-measure text-xs text-parchment-dim">{t('settings.themeNote')}</p>
        <div class="mt-3 flex gap-2">
          <For each={THEMES}>
            {(candidate) => (
              <button
                type="button"
                aria-pressed={candidate === shell.theme}
                onClick={() => void shellActions.setAppearance({ theme: candidate })}
                class={`${CHOICE} ${candidate === shell.theme ? CHOSEN : RESTING}`}
              >
                <Show when={candidate === shell.theme}>
                  <CheckIcon />
                </Show>
                {t(THEME_LABELS[candidate])}
              </button>
            )}
          </For>
        </div>
      </section>

      <section aria-labelledby="settings-accent">
        <h2 id="settings-accent" class={GROUP_LABEL}>
          {t('settings.accent')}
        </h2>
        <p class="mt-1 max-w-measure text-xs text-parchment-dim">{t('settings.accentNote')}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <For each={ACCENTS}>
            {(candidate) => (
              <button
                type="button"
                aria-pressed={candidate === shell.accent}
                onClick={() => void shellActions.setAppearance({ accent: candidate })}
                class={`${CHOICE} pr-3 pl-2 ${
                  candidate === shell.accent ? 'border-line-strong bg-ink-600 font-medium text-parchment' : RESTING
                }`}
              >
                {/* The swatch wears the accent it names, in the mode the workbench is in, so the
                    choice shows what it changes instead of describing it. */}
                <span
                  aria-hidden="true"
                  data-accent-swatch={candidate}
                  data-accent={candidate}
                  class="h-3.5 w-3.5 rounded-full border border-line-strong/40 bg-accent"
                />
                {ACCENT_LABELS[candidate]}
              </button>
            )}
          </For>
        </div>
      </section>

      <section aria-labelledby="settings-language">
        <h2 id="settings-language" class={GROUP_LABEL}>
          {t('settings.language')}
        </h2>
        <p class="mt-1 max-w-measure text-xs text-parchment-dim">{t('settings.languageNote')}</p>
        <div class="mt-3 flex gap-2">
          <For each={LANGUAGE_SETTINGS}>
            {(candidate) => (
              <button
                type="button"
                aria-pressed={candidate === shell.language}
                onClick={() => void shellActions.setAppearance({ language: candidate })}
                class={`${CHOICE} ${candidate === shell.language ? CHOSEN : RESTING}`}
              >
                <Show when={candidate === shell.language}>
                  <CheckIcon />
                </Show>
                {labelOf(candidate)}
              </button>
            )}
          </For>
        </div>
      </section>
    </>
  )
}
