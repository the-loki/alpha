import { levelDescriptionKey, levelKey, levelTone, PERMISSION_LEVELS } from '@alpha/domain'
import { createSignal, For, Show } from 'solid-js'
import { inConversation, nextLevel, setNextLevel } from '../stores/next-message.ts'
import { useText } from '../stores/shell.ts'
import {
  CHIP,
  DOT_CLASS,
  MENU_ROW_CURRENT,
  MENU_ROW_HOVER,
  MENU_SURFACE,
  TONE_CLASS,
  TONE_HOVER,
  useDismissed,
} from './controls.ts'
import { CheckIcon } from './icons.tsx'

/**
 * The permission level, always visible, at the foot of the composer: what the message about to be
 * typed is allowed to do, next to the message. Colour distinguishes the levels, but the label is
 * what carries the meaning, so the chip still reads for someone who cannot tell danger from success.
 *
 * What it names, and what a change to it means, is the next-message rule — not this chip's.
 */
export function LevelChip() {
  const t = useText()
  const [open, setOpen] = createSignal(false)
  let container!: HTMLDivElement

  useDismissed(
    open,
    () => setOpen(false),
    () => container,
  )

  const tone = () => levelTone(nextLevel())
  return (
    <div class="relative no-drag" ref={container}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open()}
        title={
          inConversation()
            ? t('level.chipTitleHere', { description: t(levelDescriptionKey(nextLevel())) })
            : t('level.chipTitle')
        }
        onClick={() => setOpen((value) => !value)}
        class={`${CHIP} text-label transition-colors duration-normal ${TONE_CLASS[tone()]} ${TONE_HOVER[tone()]}`}
      >
        <span class={`h-1.5 w-1.5 ${DOT_CLASS[tone()]}`} aria-hidden="true" />
        {t(levelKey(nextLevel()))}
      </button>

      <Show when={open()}>
        {/* Opening upwards: the chip sits on the floor of the window, so a menu below it would be
            off the bottom of the screen. The menu is a floating layer — surface-3, a frame, a
            medium shadow (C5.4). */}
        <div
          role="menu"
          aria-label={t('level.chipTitle')}
          class={`absolute bottom-full left-0 mb-2 w-64 ${MENU_SURFACE}`}
        >
          <For each={PERMISSION_LEVELS}>
            {(candidate) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={candidate === nextLevel()}
                onClick={() => {
                  void setNextLevel(candidate)
                  setOpen(false)
                }}
                class={`block w-full px-3 py-2 text-left transition-colors duration-normal ${
                  candidate === nextLevel() ? MENU_ROW_CURRENT : MENU_ROW_HOVER
                }`}
              >
                <span class="flex items-center gap-2 font-text text-name text-foreground">
                  <span class={`h-1.5 w-1.5 ${DOT_CLASS[levelTone(candidate)]}`} aria-hidden="true" />
                  {t(levelKey(candidate))}
                  {/* The mark of the one in force, in the place every menu in the app puts it: the
                      dot says which level it is, the check says that it is the one being used. */}
                  <CheckIcon class={`ml-auto ${candidate === nextLevel() ? 'text-accent' : 'invisible'}`} />
                </span>
                <span class="mt-0.5 block font-mono text-xs leading-snug text-faint">
                  {t(levelDescriptionKey(candidate))}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
