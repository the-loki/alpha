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
      <p class="mt-1 max-w-measure font-text text-name leading-relaxed text-muted">{t('settings.defaultLevelNote')}</p>
      <ul class="mt-3 space-y-1.5">
        <For each={PERMISSION_LEVELS}>
          {(candidate) => (
            <li>
              <button
                type="button"
                aria-pressed={candidate === shell.workspaceLevel}
                onClick={() => void shellActions.setPermissionLevel(candidate)}
                class={`flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-normal hover:bg-surface-1 ${
                  candidate === shell.workspaceLevel ? TONE_CLASS[levelTone(candidate)] : 'border-line text-muted'
                }`}
              >
                <span class="min-w-0 flex-1">
                  <span class="block font-text text-name">{t(levelKey(candidate))}</span>
                  <span class="mt-0.5 block font-text text-name leading-relaxed text-faint">
                    {t(levelDescriptionKey(candidate))}
                  </span>
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
