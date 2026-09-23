import type { ConversationModel } from '@alpha/domain'
import { createSignal, For, onMount, Show } from 'solid-js'
import { inConversation, runningModel, setRunningModel } from '../stores/next-message.ts'
import { providerActions, providers } from '../stores/providers.ts'
import { useText } from '../stores/shell.ts'
import {
  CHIP_QUIET,
  CHIP as CHIP_SHAPE,
  GROUP_LABEL,
  MENU_ROW_CURRENT,
  MENU_ROW_HOVER,
  MENU_SURFACE,
  useDismissed,
} from './controls.ts'
import { CheckIcon } from './icons.tsx'
import { SCROLLS } from './ledger.ts'

/** A model's name is a proper noun the machine measures by — mono, set plain (C5.3). */
const CHIP = `${CHIP_SHAPE} max-w-56 ${CHIP_QUIET}`

/**
 * Which model the next message runs on, at the foot of the composer beside the send control. The
 * name is the model's own, since that is what the user recognises, and the provider is the group it
 * sits under in the menu. What it names, and what a change to it means, is the next-message rule —
 * not this chip's.
 */
export function ModelChip() {
  const t = useText()
  const [open, setOpen] = createSignal(false)
  let container!: HTMLDivElement

  onMount(() => {
    void providerActions.load()
  })

  useDismissed(
    open,
    () => setOpen(false),
    () => container,
  )

  const running = runningModel()
  const title = () => {
    const name = running.name()
    return name === undefined
      ? t('model.noneHint')
      : t(inConversation() ? 'model.chipTitleHere' : 'model.chipTitleDefault', { model: name })
  }
  const choose = (next: ConversationModel) => {
    setOpen(false)
    void setRunningModel(next)
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
          class={`absolute right-0 bottom-full mb-2 max-h-80 w-64 ${MENU_SURFACE} ${SCROLLS}`}
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
