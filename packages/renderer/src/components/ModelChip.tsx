import type { ConversationModel, Null } from '@alpha/core'
import { useEffect, useRef, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useProviders, useRunningModel } from '../stores/providers.ts'
import { useText } from '../stores/shell.ts'
import { CheckIcon } from './icons.tsx'

const CHIP =
  'flex max-w-56 items-center gap-2 rounded-control border border-line px-2.5 py-1 text-xs text-parchment-dim transition-colors hover:border-line-strong hover:text-parchment'

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
  const activeId = useConversations((state) => state.activeId)
  const summary = useConversations((state) => state.transcript.summary)
  const setModel = useConversations((state) => state.setModel)
  const snapshot = useProviders((state) => state.snapshot)
  const load = useProviders((state) => state.load)
  const setDefaultModel = useProviders((state) => state.setDefaultModel)
  const [open, setOpen] = useState(false)
  const container = useRef<Null<HTMLDivElement>>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const inConversation = activeId !== '' && summary !== undefined
  const runningModel = useRunningModel()
  const name = runningModel.name
  const choose = async (next: ConversationModel) => {
    setOpen(false)
    if (inConversation) await setModel(next.providerId, next.modelId)
    else await setDefaultModel(next)
  }

  return (
    <div className="relative no-drag" ref={container}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={snapshot.providers.length === 0}
        title={
          name === undefined
            ? t('model.noneHint')
            : t(inConversation ? 'model.chipTitleHere' : 'model.chipTitleDefault', { model: name })
        }
        onClick={() => setOpen((value) => !value)}
        className={`${CHIP} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className="truncate">{name ?? t('model.none')}</span>
      </button>

      {open && (
        // Upwards and right-aligned: the chip sits on the floor of the window, at its right edge.
        <div
          role="menu"
          aria-label={t('model.menuLabel')}
          className="absolute right-0 bottom-full z-50 mb-2 max-h-80 w-64 overflow-y-auto rounded-overlay border border-line bg-ink-800 py-1 overlay-in shadow-overlay"
        >
          {snapshot.providers.map((provider) => (
            <div key={provider.id}>
              <p className="px-3 pt-2 pb-1 font-mono text-micro text-parchment-faint">{provider.name}</p>
              {provider.models.map((model) => {
                const current =
                  runningModel.chosen?.providerId === provider.id && runningModel.chosen.modelId === model.id
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={current}
                    onClick={() => void choose({ providerId: provider.id, modelId: model.id })}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui text-parchment transition-colors ${
                      current ? 'bg-ink-700' : 'hover:bg-ink-600'
                    }`}
                  >
                    {/* The mark of the chosen one, the same one the settings choices wear. */}
                    <CheckIcon className={current ? 'text-accent' : 'invisible'} />
                    <span className="min-w-0 flex-1 truncate">{model.name}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
