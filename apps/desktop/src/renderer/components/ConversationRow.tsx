import { type ConversationSummary, canArchive } from '@alpha/core'
import { useNavigate } from '@solidjs/router'
import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { CONTROL_HEIGHT, DESTRUCTIVE_ACTION, TEXT_ACTION } from './controls.ts'
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
export function ConversationRow(props: {
  conversation: ConversationSummary
  /** What to show instead of the title, for a row whose title is the same on every row. */
  label?: string
  /** Where it lives, for the archived section: the folder is not on screen there. */
  detail?: string
  archived?: boolean
}) {
  const navigate = useNavigate()
  const [renaming, setRenaming] = createSignal(false)
  const [title, setTitle] = createSignal(props.conversation.title)
  const t = useText()
  const state = () => STATE[props.conversation.status]

  return (
    <Show
      when={renaming()}
      fallback={
        <li class="group relative flex items-center">
          <button
            type="button"
            onClick={() => navigate(`/c/${props.conversation.id}`)}
            aria-current={props.conversation.id === conversations.activeId}
            class={`flex min-w-0 flex-1 items-center gap-2 rounded-control py-1.5 pr-2 pl-3 text-left transition-colors ${
              props.conversation.id === conversations.activeId
                ? 'bg-ink-700 text-parchment shadow-soft'
                : 'text-parchment-dim hover:bg-ink-700/60'
            }`}
          >
            <span class="flex w-4 shrink-0 justify-center">
              <span class={`h-1.5 w-1.5 rounded-full ${state().dot}`} aria-hidden="true" />
            </span>
            {/* A name, not a measurement: sans, like every other name in the app. What the row's
                state is, and when it was last touched, are the data — those stay mono. */}
            <span class="min-w-0 flex-1 truncate text-ui">{props.label ?? props.conversation.title}</span>
            <Show when={props.detail !== undefined}>
              {/* Capped rather than free: the folder is the row's context, not its subject, and an
                  unbounded detail leaves the name two characters wide. */}
              <span class="max-w-20 shrink-0 truncate font-mono text-micro text-parchment-faint">{props.detail}</span>
            </Show>
            <span class="sr-only">{t(state().key)}</span>
          </button>
          <RowActions
            conversation={props.conversation}
            archived={props.archived === true}
            onRename={() => setRenaming(true)}
          />
        </li>
      }
    >
      <li class="px-1 py-0.5">
        <input
          // Renaming is deliberate, and the field is the whole act.
          autofocus
          value={title()}
          aria-label={t('sidebar.conversationTitle')}
          onInput={(event) => setTitle(event.currentTarget.value)}
          onBlur={() => setRenaming(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setRenaming(false)
            if (event.key !== 'Enter') return
            const next = title().trim()
            setRenaming(false)
            if (next !== '' && next !== props.conversation.title) {
              void conversationActions.rename(props.conversation.id, next)
            }
          }}
          class={`w-full rounded-control border border-line-strong bg-ink-700 px-2 text-ui text-parchment focus:outline-none ${CONTROL_HEIGHT}`}
        />
      </li>
    </Show>
  )
}

/**
 * The `⋯` and what is behind it: rename, archive (or unarchive), delete. It closes on Escape and
 * on a click anywhere else, the way the level chip's menu does — one menu behaviour in the app.
 */
function RowActions(props: { conversation: ConversationSummary; archived: boolean; onRename: () => void }) {
  const [open, setOpen] = createSignal(false)
  let container!: HTMLSpanElement
  const t = useText()

  createEffect(() => {
    if (!open()) return
    const onMouseDown = (event: MouseEvent) => {
      if (!container.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    onCleanup(() => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    })
  })

  // A conversation that is working, or waiting on an answer, is not offered for archiving: the
  // reason is written on the item rather than left to a greyed-out word (ticket #79).
  const blocked = () => !canArchive(props.conversation)

  return (
    <span ref={container} class="absolute inset-y-0 right-0">
      <span class="flex h-full items-center rounded-control bg-ink-700 pr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={t('sidebar.actions', { title: props.conversation.title })}
          aria-haspopup="menu"
          aria-expanded={open()}
          onClick={() => setOpen((value) => !value)}
          class="grid h-5 w-5 place-items-center text-parchment-dim transition-colors hover:text-parchment"
        >
          <MoreIcon />
        </button>
      </span>
      <Show when={open()}>
        <div
          role="menu"
          aria-label={t('sidebar.actions', { title: props.conversation.title })}
          class="absolute top-full right-0 z-50 w-44 overflow-hidden rounded-overlay border border-line bg-ink-800 py-1 overlay-in shadow-overlay"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              props.onRename()
            }}
            class={`block w-full px-3 py-1.5 text-left ${TEXT_ACTION}`}
          >
            {t('sidebar.renameAction')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={blocked() && !props.archived}
            title={blocked() && !props.archived ? t('sidebar.archiveBlocked') : undefined}
            onClick={() => {
              setOpen(false)
              void (props.archived
                ? conversationActions.unarchive(props.conversation.id)
                : conversationActions.archive(props.conversation.id))
            }}
            class={`block w-full px-3 py-1.5 text-left ${TEXT_ACTION} disabled:cursor-not-allowed disabled:text-parchment-faint disabled:hover:text-parchment-faint`}
          >
            {props.archived ? t('sidebar.unarchiveAction') : t('sidebar.archiveAction')}
            <Show when={blocked() && !props.archived}>
              <span class="mt-0.5 block text-micro text-parchment-faint">{t('sidebar.archiveBlocked')}</span>
            </Show>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void conversationActions.remove(props.conversation.id)}
            class={`block w-full px-3 py-1.5 text-left ${DESTRUCTIVE_ACTION}`}
          >
            {t('sidebar.deleteAction')}
          </button>
        </div>
      </Show>
    </span>
  )
}
