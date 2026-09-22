import { LANGUAGE_SETTINGS, type LanguageSetting, type TextKey, THEMES, type Theme } from '@alpha/core'
import { For, Show } from 'solid-js'
import { shell, shellActions, useText } from '../../stores/shell.ts'
import { CONTROL_HEIGHT, GROUP_LABEL } from '../controls.ts'
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

/**
 * A choice carries a mark, not only a colour (C5.7): the chosen one is tinted, and `aria-pressed`
 * says the same to a reader. The tint is the accent — the one second ink — and the row answers the
 * pointer by pooling ink, like every resting thing in the window (C5.6).
 */
const CHOICE = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md border px-3 font-mono text-label font-medium transition-colors duration-normal`
const CHOSEN = 'border-accent/50 bg-accent/10 text-accent'
const RESTING = 'border-line text-muted hover:bg-surface-1'

/** How the workbench looks and reads: the palette and the language. */
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
        <p class="mt-1 max-w-measure font-text text-name leading-relaxed text-muted">{t('settings.themeNote')}</p>
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

      <section aria-labelledby="settings-language">
        <h2 id="settings-language" class={GROUP_LABEL}>
          {t('settings.language')}
        </h2>
        <p class="mt-1 max-w-measure font-text text-name leading-relaxed text-muted">{t('settings.languageNote')}</p>
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
