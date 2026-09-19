import { type ConversationSummary, canArchive, type Null } from '@alpha/core'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { DESTRUCTIVE_ACTION, TEXT_ACTION } from './controls.ts'
import { MoreIcon } from './icons.tsx'

/** The three states a conversation can be in, told apart by colour and by a word. */
const STATE = {
  idle: { dot: 'bg-line-strong', key: 'sidebar.idle' },
  running: { dot: 'bg-accent', key: 'sidebar.working' },
  waiting: { dot: 'bg-amber', key: 'sidebar.waiting' },
} as const

/**
 * One conversation. At rest it is the name and nothing else; the things you can do to it appear
 * where its tail was, on hover or keyboard focus, behind a single `⋯` (ticket #80 — a row of
 * icons covered the name it was drawn over).
 */
export function ConversationRow({
  conversation,
  label,
  detail,
  archived = false,
}: {
  conversation: ConversationSummary
  /** What to show instead of the title, for a row whose title is the same on every row. */
  label?: string
  /** Where it lives, for the archived section: the folder is not on screen there. */
  detail?: string
  archived?: boolean
}) {
  const activeId = useConversations((state) => state.activeId)
  const rename = useConversations((state) => state.rename)
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const t = useText()
  const state = STATE[conversation.status]

  if (renaming) {
    return (
      <li className="px-1 py-0.5">
        <input
          // biome-ignore lint/a11y/noAutofocus: renaming is deliberate, and the field is the whole act.
          autoFocus
          value={title}
          aria-label={t('sidebar.conversationTitle')}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => setRenaming(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setRenaming(false)
            if (event.key !== 'Enter') return
            const next = title.trim()
            setRenaming(false)
            if (next !== '' && next !== conversation.title) void rename(conversation.id, next)
          }}
          className="w-full rounded-control border border-line-strong bg-ink-700 px-2 py-1 text-ui text-parchment focus:outline-none"
        />
      </li>
    )
  }

  return (
    <li className="group relative flex items-center">
      <button
        type="button"
        onClick={() => void navigate({ to: '/c/$conversationId', params: { conversationId: conversation.id } })}
        aria-current={conversation.id === activeId}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-control py-1.5 pr-2 pl-3 text-left transition-colors ${
          conversation.id === activeId
            ? 'bg-ink-700 text-parchment shadow-soft'
            : 'text-parchment-dim hover:bg-ink-700/60'
        }`}
      >
        <span className="flex w-4 shrink-0 justify-center">
          <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} aria-hidden="true" />
        </span>
        {/* A name, not a measurement: sans, like every other name in the app. What the row's
            state is, and when it was last touched, are the data — those stay mono. */}
        <span className="min-w-0 flex-1 truncate text-ui">{label ?? conversation.title}</span>
        {detail !== undefined && (
          // Capped rather than free: the folder is the row's context, not its subject, and an
          // unbounded detail leaves the name two characters wide.
          <span className="max-w-20 shrink-0 truncate font-mono text-micro text-parchment-faint">{detail}</span>
        )}
        <span className="sr-only">{t(state.key)}</span>
      </button>
      <RowActions conversation={conversation} archived={archived} onRename={() => setRenaming(true)} />
    </li>
  )
}

/**
 * The `⋯` and what is behind it: rename, archive (or unarchive), delete. It closes on Escape and
 * on a click anywhere else, the way the level chip's menu does — one menu behaviour in the app.
 */
function RowActions({
  conversation,
  archived,
  onRename,
}: {
  conversation: ConversationSummary
  archived: boolean
  onRename: () => void
}) {
  const archive = useConversations((state) => state.archive)
  const unarchive = useConversations((state) => state.unarchive)
  const remove = useConversations((state) => state.remove)
  const [open, setOpen] = useState(false)
  const container = useRef<Null<HTMLSpanElement>>(null)
  const t = useText()

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // A conversation that is working, or waiting on an answer, is not offered for archiving: the
  // reason is written on the item rather than left to a greyed-out word (ticket #79).
  const blocked = !canArchive(conversation)

  return (
    <span ref={container} className="absolute inset-y-0 right-0">
      <span className="flex h-full items-center rounded-control bg-ink-700 pr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={t('sidebar.actions', { title: conversation.title })}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="grid h-5 w-5 place-items-center text-parchment-dim transition-colors hover:text-parchment"
        >
          <MoreIcon />
        </button>
      </span>
      {open && (
        <div
          role="menu"
          aria-label={t('sidebar.actions', { title: conversation.title })}
          className="absolute top-full right-0 z-50 w-44 overflow-hidden rounded-overlay border border-line bg-ink-800 py-1 shadow-xl shadow-black/40"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onRename()
            }}
            className={`block w-full px-3 py-1.5 text-left ${TEXT_ACTION}`}
          >
            {t('sidebar.renameAction')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={blocked && !archived}
            title={blocked && !archived ? t('sidebar.archiveBlocked') : undefined}
            onClick={() => {
              setOpen(false)
              void (archived ? unarchive(conversation.id) : archive(conversation.id))
            }}
            className={`block w-full px-3 py-1.5 text-left ${TEXT_ACTION} disabled:cursor-not-allowed disabled:text-parchment-faint disabled:hover:text-parchment-faint`}
          >
            {archived ? t('sidebar.unarchiveAction') : t('sidebar.archiveAction')}
            {blocked && !archived && (
              <span className="mt-0.5 block text-micro text-parchment-faint">{t('sidebar.archiveBlocked')}</span>
            )}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void remove(conversation.id)}
            className={`block w-full px-3 py-1.5 text-left ${DESTRUCTIVE_ACTION}`}
          >
            {t('sidebar.deleteAction')}
          </button>
        </div>
      )}
    </span>
  )
}
