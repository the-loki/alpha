import { levelDescriptionKey, levelKey, levelTone, PERMISSION_LEVELS, type PermissionLevel } from '@alpha/core'
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { shell, shellActions, useText } from '../stores/shell.ts'
import { CHIP, ROW_CURRENT, ROW_HOVER } from './controls.ts'
import { CheckIcon } from './icons.tsx'

/** How each tone of the permission level reads: the settings page uses the same map. */
export const TONE_CLASS: Record<string, string> = {
  info: 'text-info border-info/40 bg-info/10',
  amber: 'text-amber border-amber/40 bg-amber/10',
  jade: 'text-jade border-jade/40 bg-jade/10',
  warm: 'text-warm border-warm/40 bg-warm/10',
}

const DOT_CLASS: Record<string, string> = {
  info: 'bg-info',
  amber: 'bg-amber',
  jade: 'bg-jade',
  warm: 'bg-warm',
}

/**
 * The permission level, always visible, at the foot of the composer: what the message about to be
 * typed is allowed to do, next to the message. Colour distinguishes the levels, but the label is
 * what carries the meaning, so the chip still reads for someone who cannot tell warm from jade.
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
        class={`${CHIP} font-medium transition-colors ${TONE_CLASS[tone()]}`}
      >
        <span class={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[tone()]}`} aria-hidden="true" />
        {t(levelKey(level()))}
      </button>

      <Show when={open()}>
        {/* Opening upwards: the chip sits on the floor of the window, so a menu below it would be
            off the bottom of the screen. */}
        <div
          role="menu"
          aria-label={t('level.chipTitle')}
          class="absolute bottom-full left-0 overlay-in z-50 mb-2 w-64 overflow-hidden rounded-overlay border border-line bg-surface-overlay py-1 shadow-overlay"
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
                class={`block w-full px-3 py-2 text-left transition-colors ${
                  candidate === level() ? ROW_CURRENT : ROW_HOVER
                }`}
              >
                <span class="flex items-center gap-2 text-ui text-parchment">
                  <span class={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[levelTone(candidate)]}`} aria-hidden="true" />
                  {t(levelKey(candidate))}
                  {/* The mark of the one in force, in the place every menu in the app puts it: the
                      dot says which level it is, the check says that it is the one being used. */}
                  <CheckIcon class={`ml-auto ${candidate === level() ? 'text-accent' : 'invisible'}`} />
                </span>
                <span class="mt-0.5 block text-xs leading-snug text-parchment-faint">
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
