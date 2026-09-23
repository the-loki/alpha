import { type ConversationSummary, canArchive, formatAge } from '@alpha/domain'
import { useNavigate } from '@solidjs/router'
import { createSignal, Show } from 'solid-js'
import { conversationActions, conversations } from '../../stores/conversations.ts'
import { foldActions } from '../../stores/fold.ts'
import { useText } from '../../stores/shell.ts'
import {
  CONTROL_HEIGHT,
  DESTRUCTIVE_ACTION,
  FIELD_FRAME,
  LIVE_SPINE,
  MENU_ROW_HOVER,
  MENU_SURFACE,
  RAIL_ROW,
  ROW_LIVE,
  TEXT_ACTION,
  useDismissed,
} from '../controls.ts'
import { MoreIcon } from '../icons.tsx'

/**
 * The three states a conversation can be in, told apart by colour and by a word: the accent is
 * `running` because that is what the second ink means — happening now (C5.2).
 */
const STATE = {
  idle: { dot: 'bg-line-strong', key: 'sidebar.idle' },
  running: { dot: 'bg-accent status-live', key: 'sidebar.working' },
  waiting: { dot: 'bg-warning', key: 'sidebar.waiting' },
} as const

/**
 * One row of the rail: a square state mark, a name in the text voice, and whatever the row is
 * measured by — its age, the folder for a row in the archive — right-aligned at the row's end in
 * the apparatus voice, joined to nothing (C5.4, C5.5). The row you are in carries the accent's
 * margin tick at its left edge (C5.5).
 *
 * The things you can do to it appear at the row's end, on hover or keyboard focus, behind a
 * single `⋯` — a row of icons covered the name it was drawn over.
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
  const current = () => props.conversation.id === conversations.activeId
  // The measure at the row's end: the folder it rests in, for the archive — its age, for a plain
  // entry. A run under a task carries its age already, and measures nothing.
  const measure = () =>
    props.detail ?? (props.label === undefined ? formatAge(props.conversation.updatedAt, Date.now()) : undefined)

  return (
    <Show
      when={renaming()}
      fallback={
        <li class="group relative flex items-center">
          <button
            type="button"
            onClick={foldActions.choose(() => navigate(`/c/${props.conversation.id}`))}
            aria-current={current()}
            class={`relative flex min-w-0 flex-1 items-center py-1.5 text-left transition-colors ${RAIL_ROW} ${
              current() ? `${ROW_LIVE} text-foreground` : 'text-muted hover:bg-surface-2 hover:text-foreground'
            }`}
          >
            <Show when={current()}>
              <span class={LIVE_SPINE} aria-hidden="true" />
            </Show>
            <span class="flex w-4 shrink-0 justify-center">
              <span class={`h-1.5 w-1.5 ${state().dot}`} aria-hidden="true" />
            </span>
            {/* A name is the text voice (C5.3); the measure at the row's end is the apparatus's,
                and goes unspoken — the name and the state are the row's words. It stands at the
                row's end rather than running to it: nothing joins the two. */}
            <span class="min-w-0 flex-1 truncate font-text text-name">{props.label ?? props.conversation.title}</span>
            <Show when={measure() !== undefined}>
              <span aria-hidden="true" class="max-w-20 shrink-0 truncate font-mono text-label text-faint">
                {measure()}
              </span>
            </Show>
            <span class="sr-only">{t(state().key)}</span>
          </button>
          <RowActions
            conversation={props.conversation}
            archived={props.archived === true}
            current={current()}
            onRename={() => setRenaming(true)}
          />
        </li>
      }
    >
      <li class="px-1 py-0.5">
        <input
          // Renaming is deliberate, and the field is the whole act. A title is the person's words,
          // so it is set in the text voice even here.
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
          class={`w-full px-2 font-text text-name ${CONTROL_HEIGHT} ${FIELD_FRAME}`}
        />
      </li>
    </Show>
  )
}

/**
 * The `⋯` and what is behind it: rename, archive (or unarchive), export, delete. What is done to
 * a conversation lives on the conversation's own row (C5.4). The menu is a floating layer — the
 * floating surface, a frame, no motion but its own arrival (C5.4). It closes on Escape and on a
 * click anywhere else, the way every menu in the app does.
 */
function RowActions(props: {
  conversation: ConversationSummary
  archived: boolean
  current: boolean
  onRename: () => void
}) {
  const [open, setOpen] = createSignal(false)
  const [written, setWritten] = createSignal('')
  let container!: HTMLSpanElement
  const t = useText()

  useDismissed(
    open,
    () => setOpen(false),
    () => container,
  )

  // A conversation that is working, or waiting on an answer, is not offered for archiving: the
  // reason is written on the item rather than left to a greyed-out word.
  const blocked = () => !canArchive(props.conversation)

  return (
    <span ref={container} class="absolute inset-y-0 right-0">
      {/* The patch the actions fade in on wears the row's own fill — the live row's, or the one the
            pointer's hover painted — so the fade reveals nothing. */}
      <span class="flex h-full items-center pr-1 bg-surface-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={t('sidebar.actions', { title: props.conversation.title })}
          aria-haspopup="menu"
          aria-expanded={open()}
          onClick={() => setOpen((value) => !value)}
          class="grid h-6 w-6 place-items-center text-muted transition-colors hover:text-foreground"
        >
          <MoreIcon />
        </button>
      </span>
      <Show when={open()}>
        <div
          role="menu"
          aria-label={t('sidebar.actions', { title: props.conversation.title })}
          class={`absolute top-full right-0 w-44 ${MENU_SURFACE}`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              props.onRename()
            }}
            class={`block w-full px-3 py-1.5 text-left ${MENU_ROW_HOVER} ${TEXT_ACTION}`}
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
            class={`block w-full px-3 py-1.5 text-left ${MENU_ROW_HOVER} ${TEXT_ACTION} disabled:cursor-not-allowed disabled:text-faint disabled:hover:text-faint`}
          >
            {props.archived ? t('sidebar.unarchiveAction') : t('sidebar.archiveAction')}
            <Show when={blocked() && !props.archived}>
              <span class="mt-0.5 block font-text text-name text-faint">{t('sidebar.archiveBlocked')}</span>
            </Show>
          </button>
          <button
            type="button"
            role="menuitem"
            // The menu stays open on export: where it wrote is said right here, under the act.
            onClick={() => void conversationActions.exportMarkdown(props.conversation.id).then(setWritten)}
            class={`block w-full px-3 py-1.5 text-left ${MENU_ROW_HOVER} ${TEXT_ACTION}`}
          >
            {t('sidebar.exportAction')}
          </button>
          <Show when={written() !== ''}>
            <p class="px-3 font-mono text-label text-success wrap-anywhere">
              {t('sidebar.exportedTo', { path: written() })}
            </p>
          </Show>
          <button
            type="button"
            role="menuitem"
            onClick={() => void conversationActions.remove(props.conversation.id)}
            class={`block w-full px-3 py-1.5 text-left ${MENU_ROW_HOVER} ${DESTRUCTIVE_ACTION}`}
          >
            {t('sidebar.deleteAction')}
          </button>
        </div>
      </Show>
    </span>
  )
}
