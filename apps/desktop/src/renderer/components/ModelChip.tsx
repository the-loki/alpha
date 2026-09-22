import type { ConversationModel } from '@alpha/core'
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { providerActions, providers, runningModel } from '../stores/providers.ts'
import { useText } from '../stores/shell.ts'
import { CHIP as CHIP_SHAPE, GROUP_LABEL, MENU_ROW_CURRENT, MENU_ROW_HOVER } from './controls.ts'
import { CheckIcon } from './icons.tsx'
import { SCROLLS } from './ledger.ts'

/** A model's name is a proper noun the machine measures by — mono, set plain (C5.3). */
const CHIP = `${CHIP_SHAPE} max-w-56 text-xs text-muted transition-colors duration-normal hover:border-line-strong hover:text-foreground`

/**
 * Which model the next message runs on, at the foot of the composer beside the send control.
 *
 * It follows the level chip's rule, because the two are the same kind of thing: with a
 * conversation open it changes *that conversation's* model, and with none open it chooses what new
 * conversations start on. The name is the model's own, since that is what the user recognises, and
 * the provider is the group it sits under in the menu.
 */
export function ModelChip() {
  const t = useText()
  const [open, setOpen] = createSignal(false)
  let container!: HTMLDivElement
  const inConversation = () => conversations.activeId !== '' && conversations.transcript.summary !== undefined

  onMount(() => {
    void providerActions.load()
  })

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

  const running = runningModel()
  const title = () => {
    const name = running.name()
    return name === undefined
      ? t('model.noneHint')
      : t(inConversation() ? 'model.chipTitleHere' : 'model.chipTitleDefault', { model: name })
  }
  const choose = async (next: ConversationModel) => {
    setOpen(false)
    if (inConversation()) await conversationActions.setModel(next.providerId, next.modelId)
    else await providerActions.setDefaultModel(next)
  }

  return (
    <div class="relative no-drag" ref={container}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open()}
        disabled={providers.snapshot.providers.length === 0}
        title={title()}
        onClick={() => setOpen((value) => !value)}
        class={`${CHIP} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span class="truncate">{running.name() ?? t('model.none')}</span>
      </button>

      <Show when={open()}>
        {/* Upwards and right-aligned: the chip sits on the floor of the window, at its right edge.
            The menu is a floating layer — surface-3, a frame, a medium shadow (C5.4). */}
        <div
          role="menu"
          aria-label={t('model.menuLabel')}
          class={`slip-in absolute right-0 bottom-full z-50 mb-2 max-h-80 w-64 rounded-xl border border-line bg-surface-3 py-1 shadow-medium ${SCROLLS}`}
        >
          <For each={providers.snapshot.providers}>
            {(provider) => (
              <div>
                <p class={`px-3 pt-2 pb-1 ${GROUP_LABEL}`}>{provider.name}</p>
                <For each={provider.models}>
                  {(model) => {
                    const current = () =>
                      running.chosen()?.providerId === provider.id && running.chosen()?.modelId === model.id
                    return (
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={current()}
                        onClick={() => void choose({ providerId: provider.id, modelId: model.id })}
                        class={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-text text-name text-foreground transition-colors duration-normal ${
                          current() ? MENU_ROW_CURRENT : MENU_ROW_HOVER
                        }`}
                      >
                        {/* The mark of the chosen one, the same one the settings choices wear. */}
                        <CheckIcon class={current() ? 'text-accent' : 'invisible'} />
                        <span class="min-w-0 flex-1 truncate">{model.name}</span>
                      </button>
                    )
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
