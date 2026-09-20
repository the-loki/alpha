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

const CHOICE = 'flex h-7 items-center gap-2 rounded-control border px-3 text-xs transition-colors'
const CHOSEN = 'border-accent/50 bg-accent/10 text-accent'
const RESTING = 'border-line text-parchment-dim hover:bg-ink-600'

/** How the workbench looks and reads: the palette, the accent, and the language. */
export function AppearanceSection() {
  const t = useText()

  return (
    <>
      <section aria-labelledby="settings-theme">
        <h2 id="settings-theme" class="text-body font-medium text-parchment">
          {t('settings.theme')}
        </h2>
        <p class="mt-1 text-xs text-parchment-dim">{t('settings.themeNote')}</p>
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
        <h2 id="settings-accent" class="text-body font-medium text-parchment">
          {t('settings.accent')}
        </h2>
        <p class="mt-1 text-xs text-parchment-dim">{t('settings.accentNote')}</p>
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
        <h2 id="settings-language" class="text-body font-medium text-parchment">
          {t('settings.language')}
        </h2>
        <p class="mt-1 text-xs text-parchment-dim">{t('settings.languageNote')}</p>
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
                {LANGUAGE_LABELS[candidate]}
              </button>
            )}
          </For>
        </div>
      </section>
    </>
  )
}
