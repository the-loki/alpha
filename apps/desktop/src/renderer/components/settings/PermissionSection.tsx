import { levelDescriptionKey, levelKey, levelTone, PERMISSION_LEVELS } from '@alpha/core'
import { For, Show } from 'solid-js'
import { shell, shellActions, useText } from '../../stores/shell.ts'
import { GROUP_LABEL } from '../controls.ts'
import { CheckIcon } from '../icons.tsx'
import { TONE_CLASS } from '../LevelChip.tsx'

/** The level a new conversation in this workspace starts at. */
export function PermissionSection() {
  const t = useText()

  return (
    <section aria-labelledby="settings-level">
      <h2 id="settings-level" class={GROUP_LABEL}>
        {t('settings.defaultLevel')}
      </h2>
      <p class="mt-1 max-w-measure text-xs text-parchment-dim">{t('settings.defaultLevelNote')}</p>
      <ul class="mt-3 space-y-1.5">
        <For each={PERMISSION_LEVELS}>
          {(candidate) => (
            <li>
              <button
                type="button"
                aria-pressed={candidate === shell.workspaceLevel}
                onClick={() => void shellActions.setPermissionLevel(candidate)}
                class={`flex w-full items-start gap-3 rounded-card border px-3 py-2.5 text-left transition-colors hover:bg-ink-600 ${
                  candidate === shell.workspaceLevel
                    ? TONE_CLASS[levelTone(candidate)]
                    : 'border-line text-parchment-dim'
                }`}
              >
                <span class="min-w-0 flex-1">
                  <span class="block text-ui font-medium">{t(levelKey(candidate))}</span>
                  <span class="mt-0.5 block text-xs text-parchment-faint">{t(levelDescriptionKey(candidate))}</span>
                </span>
                {/* The chosen level is marked, not only tinted: the tints are the level's own colours
                    and someone who cannot tell them apart still has to see which one is on. */}
                <Show when={candidate === shell.workspaceLevel}>
                  <CheckIcon class="mt-0.5 text-current" />
                </Show>
              </button>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}
