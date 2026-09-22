import { levelDescriptionKey, levelKey, levelTone, PERMISSION_LEVELS, type PermissionLevel } from '@alpha/core'
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { shell, shellActions, useText } from '../stores/shell.ts'
import { CHIP, MENU_ROW_CURRENT, MENU_ROW_HOVER } from './controls.ts'
import { CheckIcon } from './icons.tsx'

/**
 * How each tone of the permission level reads in the two-ink palette: the four level stamps —
 * info, warning, success and danger — one semantic hue per level, `full-access` wearing the red
 * because unbounded is the risky one (C5.2). The settings page uses the same map.
 */
export const TONE_CLASS: Record<string, string> = {
  info: 'text-info border-info/50',
  warning: 'text-warning border-warning/50',
  success: 'text-success border-success/50',
  danger: 'text-danger border-danger/50',
}

/** Square state marks, like every dot of state in the window: a mark is the smallest radius (C5.4). */
export const DOT_CLASS: Record<string, string> = {
  info: 'bg-info',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
}

/**
 * What the pointer does to a chip: brighten its own frame and keep its fill — a chip answers in
 * its frame, because its colour is the level it is named for (C5.6).
 */
export const TONE_HOVER: Record<string, string> = {
  info: 'hover:border-info',
  warning: 'hover:border-warning',
  success: 'hover:border-success',
  danger: 'hover:border-danger',
}

/**
 * The permission level, always visible, at the foot of the composer: what the message about to be
 * typed is allowed to do, next to the message. Colour distinguishes the levels, but the label is
 * what carries the meaning, so the chip still reads for someone who cannot tell danger from success.
 *
 * With a conversation open the chip changes *that conversation's* level, and it shows that
 * conversation's level — a transcript and the level it ran under belong together. With no
 * conversation open it changes the folder's default, which is the level the next conversation
 * starts at.
 */
export function LevelChip() {
  const t = useText()
  const [open, setOpen] = createSignal(false)
  let container!: HTMLDivElement
  const inConversation = () => conversations.activeId !== '' && conversations.transcript.summary !== undefined
  const level = (): PermissionLevel => {
    const summary = conversations.transcript.summary
    return conversations.activeId !== '' && summary !== undefined ? summary.permissionLevel : shell.workspaceLevel
  }
  const setPermissionLevel = async (next: PermissionLevel) => {
    if (inConversation()) await conversationActions.setLevel(next)
    else await shellActions.setPermissionLevel(next)
  }

  createEffect(() => {
    if (!open()) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (container && !container.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    onCleanup(() => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    })
  })

  const tone = () => levelTone(level())
  return (
    <div class="relative no-drag" ref={container}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open()}
        title={
          inConversation()
            ? t('level.chipTitleHere', { description: t(levelDescriptionKey(level())) })
            : t('level.chipTitle')
        }
        onClick={() => setOpen((value) => !value)}
        class={`${CHIP} text-label transition-colors duration-normal ${TONE_CLASS[tone()]} ${TONE_HOVER[tone()]}`}
      >
        <span class={`h-1.5 w-1.5 ${DOT_CLASS[tone()]}`} aria-hidden="true" />
        {t(levelKey(level()))}
      </button>

      <Show when={open()}>
        {/* Opening upwards: the chip sits on the floor of the window, so a menu below it would be
            off the bottom of the screen. The menu is a floating layer — surface-3, a frame, a
            medium shadow (C5.4). */}
        <div
          role="menu"
          aria-label={t('level.chipTitle')}
          class="slip-in absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-line bg-surface-3 py-1 shadow-medium"
        >
          <For each={PERMISSION_LEVELS}>
            {(candidate) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={candidate === level()}
                onClick={() => {
                  void setPermissionLevel(candidate)
                  setOpen(false)
                }}
                class={`block w-full px-3 py-2 text-left transition-colors duration-normal ${
                  candidate === level() ? MENU_ROW_CURRENT : MENU_ROW_HOVER
                }`}
              >
                <span class="flex items-center gap-2 font-text text-name text-foreground">
                  <span class={`h-1.5 w-1.5 ${DOT_CLASS[levelTone(candidate)]}`} aria-hidden="true" />
                  {t(levelKey(candidate))}
                  {/* The mark of the one in force, in the place every menu in the app puts it: the
                      dot says which level it is, the check says that it is the one being used. */}
                  <CheckIcon class={`ml-auto ${candidate === level() ? 'text-accent' : 'invisible'}`} />
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
