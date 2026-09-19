import type { ConversationSummary, Null, Undef } from '@alpha/core'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'

/** How many matches the palette shows at once: more than this is a list, not a shortcut. */
const SHOWN = 8

const matches = (conversations: ConversationSummary[], query: string): ConversationSummary[] => {
  const needle = query.trim().toLowerCase()
  const found =
    needle === '' ? conversations : conversations.filter((entry) => entry.title.toLowerCase().includes(needle))
  return found.slice(0, SHOWN)
}

/**
 * Switching conversations without leaving the keyboard (T1's story 8): Control/Command-K opens a
 * list of the ones there are, typed into it filters them, arrows move, Enter opens, Escape leaves.
 */
export function ConversationPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Archived conversations are not offered here: this is the list of what you are working on, and
  // the palette shows eight at a time — an archived one would push a live one out (ticket #79).
  const conversations = useConversations((state) => state.list).filter(
    (conversation) => conversation.archivedAt === undefined,
  )
  const t = useText()
  const openConversation = useConversations((state) => state.open)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState(0)
  const field = useRef<Null<HTMLInputElement>>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setChosen(0)
    field.current?.focus()
  }, [open])

  if (!open) return null
  const shown = matches(conversations, query)

  const go = (conversation: Undef<ConversationSummary>) => {
    if (conversation === undefined) return
    onClose()
    void openConversation(conversation.id).then(() =>
      navigate({ to: '/c/$conversationId', params: { conversationId: conversation.id } }),
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('palette.dialog')}
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/60 pt-24"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-overlay border border-line bg-ink-800 shadow-xl shadow-black/50">
        <input
          ref={field}
          aria-label={t('palette.search')}
          placeholder={t('palette.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setChosen(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
            if (event.key === 'Enter') go(shown[chosen])
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setChosen((index) => Math.min(index + 1, shown.length - 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setChosen((index) => Math.max(index - 1, 0))
            }
          }}
          className="w-full border-b border-line bg-transparent px-4 py-3 text-body text-parchment placeholder:text-parchment-faint focus:outline-none"
        />
        <div role="listbox" aria-label={t('palette.list')} className="max-h-80 overflow-y-auto py-1">
          {shown.map((conversation, index) => (
            <button
              key={conversation.id}
              type="button"
              role="option"
              aria-selected={index === chosen}
              onMouseEnter={() => setChosen(index)}
              onClick={() => go(conversation)}
              className={`flex w-full items-baseline gap-3 px-4 py-2 text-left ${index === chosen ? 'bg-ink-600' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate text-ui text-parchment">{conversation.title}</span>
              <span className="shrink-0 font-mono text-micro text-parchment-faint">{conversation.status}</span>
            </button>
          ))}
          {shown.length === 0 && (
            <p className="px-4 py-3 text-ui text-parchment-dim">
              {t(conversations.length === 0 ? 'palette.empty' : 'palette.noMatch')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** The shortcuts that are not the composer's: new, switch, and settings. */
export function useShortcuts({ onPalette }: { onPalette: () => void }): void {
  const navigate = useNavigate()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key === 'k') {
        event.preventDefault()
        onPalette()
      }
      if (event.key === 'n') {
        event.preventDefault()
        void navigate({ to: '/' })
      }
      if (event.key === ',') {
        event.preventDefault()
        void navigate({ to: '/settings' })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navigate, onPalette])
}
