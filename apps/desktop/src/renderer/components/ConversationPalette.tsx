import type { ConversationSummary, Undef } from '@alpha/core'
import { useNavigate } from '@solidjs/router'
import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { ROW_CURRENT } from './controls.ts'

/** How many matches the palette shows at once: more than this is a list, not a shortcut. */
const SHOWN = 8

const matches = (available: ConversationSummary[], query: string): ConversationSummary[] => {
  const needle = query.trim().toLowerCase()
  const found = needle === '' ? available : available.filter((entry) => entry.title.toLowerCase().includes(needle))
  return found.slice(0, SHOWN)
}

/**
 * Switching conversations without leaving the keyboard (T1's story 8): Control/Command-K opens a
 * list of the ones there are, typed into it filters them, arrows move, Enter opens, Escape leaves.
 */
export function ConversationPalette(props: { open: boolean; onClose: () => void }) {
  // Archived conversations are not offered here: this is the list of what you are working on, and
  // the palette shows eight at a time — an archived one would push a live one out (ticket #79).
  const available = () => conversations.list.filter((conversation) => conversation.archivedAt === undefined)
  const t = useText()
  const navigate = useNavigate()
  const [query, setQuery] = createSignal('')
  const [chosen, setChosen] = createSignal(0)
  let field: Undef<HTMLInputElement>

  // Every opening starts from nothing: the last search and the last row are not what is being
  // looked for now. The read of `open` is what makes this the effect that follows it.
  createEffect(() => {
    if (!props.open) return
    setQuery('')
    setChosen(0)
    field?.focus()
  })

  const shown = () => matches(available(), query())

  const go = (conversation: Undef<ConversationSummary>) => {
    if (conversation === undefined) return
    props.onClose()
    void conversationActions.open(conversation.id).then(() => navigate(`/c/${conversation.id}`))
  }

  return (
    <Show when={props.open}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.dialog')}
        class="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/60 pt-24"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) props.onClose()
        }}
      >
        <div class="w-full max-w-xl overflow-hidden rounded-overlay border border-line bg-surface-overlay overlay-in shadow-overlay">
          <input
            ref={(element) => {
              field = element
            }}
            aria-label={t('palette.search')}
            placeholder={t('palette.placeholder')}
            value={query()}
            onInput={(event) => {
              setQuery(event.target.value)
              setChosen(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') props.onClose()
              if (event.key === 'Enter') go(shown()[chosen()])
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setChosen((index) => Math.min(index + 1, shown().length - 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setChosen((index) => Math.max(index - 1, 0))
              }
            }}
            class="w-full border-b border-line bg-transparent px-4 py-3 text-body text-parchment placeholder:text-parchment-faint"
          />
          <div role="listbox" aria-label={t('palette.list')} class="max-h-80 overflow-y-auto py-1">
            <For each={shown()}>
              {(conversation, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index() === chosen()}
                  onMouseEnter={() => setChosen(index())}
                  onClick={() => go(conversation)}
                  class={`flex w-full items-baseline gap-3 px-4 py-2 text-left ${index() === chosen() ? ROW_CURRENT : ''}`}
                >
                  <span class="min-w-0 flex-1 truncate text-ui text-parchment">{conversation.title}</span>
                  <span class="shrink-0 font-mono text-micro text-parchment-faint">{conversation.status}</span>
                </button>
              )}
            </For>
            <Show when={shown().length === 0}>
              <p class="px-4 py-3 text-ui text-parchment-dim">
                {t(available().length === 0 ? 'palette.empty' : 'palette.noMatch')}
              </p>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}

/** The shortcuts that are not the composer's: new, switch, and settings. */
export function useShortcuts(options: { onPalette: () => void }): void {
  const navigate = useNavigate()

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key === 'k') {
        event.preventDefault()
        options.onPalette()
      }
      if (event.key === 'n') {
        event.preventDefault()
        navigate('/')
      }
      if (event.key === ',') {
        event.preventDefault()
        navigate('/settings')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown))
  })
}
