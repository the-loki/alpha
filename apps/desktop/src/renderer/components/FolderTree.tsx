import { type ConversationSummary, conversationCount, type FolderNode, folderName, type TaskNode } from '@alpha/core'
import { useNavigate } from '@solidjs/router'
import { createSignal, For, Show } from 'solid-js'
import { languageOf, shell, shellActions, useText } from '../stores/shell.ts'
import { ConversationRow } from './ConversationRow.tsx'
import { RAIL_ROW } from './controls.ts'
import { ChevronDownIcon, FolderIcon, PlusIcon } from './icons.tsx'
import { TaskGroup } from './TaskGroup.tsx'

/** What this file is: the rail's own sections — the folders, their conversations flat beneath
    them, their tasks, and the section at the end for what was put away. The column around it is
    `Sidebar.tsx`. */

const SHOWN = 8

/**
 * One folder and everything asked in it. The rail shows every folder the workbench knows at once
 * — that is the shape of the thing, not a mode to switch into — so this is a section with a title
 * row of its own, and the only thing that is ever "current" is where the composer's next message
 * lands. Sections are told apart by space, never by a rule between them (C5.4).
 */
export function FolderSection(props: { folder: FolderNode; current: boolean; tasks: TaskNode[] }) {
  const language = () => languageOf(shell.language)
  const t = useText()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = createSignal(false)
  const count = () => props.folder.conversations.length
  /** A folder with nothing under it has nothing to fold, so its row is a heading and not a control. */
  const foldable = () => count() > 0 || props.tasks.length > 0
  const rowTone = () => (props.current ? 'text-foreground' : 'text-muted')
  const label = () => (
    <>
      {/* The folder's glyph, then its name in the text voice: the title of a section, the row every
          row under it is set apart from (C5.4). */}
      <FolderIcon class={props.current ? 'text-accent' : undefined} />
      <span class="min-w-0 truncate font-text text-name">{props.folder.name}</span>
    </>
  )

  // A folder's own new conversation: the composer points here from now on, and the pane goes back
  // to being the place where the next message starts one.
  const startHere = async () => {
    await shellActions.selectWorkspace(props.folder.path)
    navigate('/')
  }

  return (
    <section class="mt-1.5" data-workspace={props.folder.path}>
      <div class="group flex items-center gap-1">
        <h2 class="min-w-0 flex-1">
          <Show
            when={foldable()}
            fallback={<span class={`flex w-full min-w-0 items-center py-1.5 ${RAIL_ROW} ${rowTone()}`}>{label()}</span>}
          >
            <button
              type="button"
              aria-expanded={!collapsed()}
              aria-label={
                collapsed()
                  ? t('sidebar.expand', { folder: props.folder.name })
                  : t('sidebar.collapse', { folder: props.folder.name })
              }
              title={props.folder.path}
              onClick={() => setCollapsed((value) => !value)}
              class={`flex w-full min-w-0 items-center py-1.5 text-left transition-colors hover:bg-surface-2 ${RAIL_ROW} ${rowTone()}`}
            >
              {label()}
            </button>
          </Show>
        </h2>
        {/* One slot, two faces: the count is what the folder holds, the plus is what you can do
            with it. They share a box so hovering never moves the folder's name. */}
        <span class="relative flex h-5 w-6 shrink-0 items-center justify-center">
          <span
            class="font-mono text-label text-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
            title={conversationCount(language(), count())}
          >
            {count()}
          </span>
          <button
            type="button"
            aria-label={t('sidebar.startIn', { folder: props.folder.name })}
            title={t('sidebar.startIn', { folder: props.folder.name })}
            onClick={() => void startHere()}
            class="absolute inset-0 grid place-items-center text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-surface-2 hover:text-foreground"
          >
            <PlusIcon />
          </button>
        </span>
      </div>

      <Show when={!collapsed()}>
        {count() === 0 && props.tasks.length === 0 ? (
          <p class={`py-1 font-text text-name text-faint ${RAIL_ROW}`}>{t('sidebar.noConversations')}</p>
        ) : (
          <ConversationList conversations={props.folder.conversations} />
        )}

        {/* The tasks that run in this folder, each with the conversations its runs made. A folder
            with no tasks grows no row: an empty group is noise for everyone who never makes one. */}
        <For each={props.tasks}>{(node) => <TaskGroup node={node} />}</For>
      </Show>
    </section>
  )
}

/**
 * A folder's conversations, newest first, eight of them at a time. The rest are one click away
 * rather than gone: this is a rail for glancing at, and the palette is the one for finding things.
 * The expanded state lives no longer than the window, like every fold in the rail.
 */
function ConversationList(props: { conversations: ConversationSummary[] }) {
  const t = useText()
  const [all, setAll] = createSignal(false)
  const shown = () => (all() ? props.conversations : props.conversations.slice(0, SHOWN))
  const hidden = () => props.conversations.length - shown().length

  return (
    <>
      <ul class="space-y-0.5">
        <For each={shown()}>{(conversation) => <ConversationRow conversation={conversation} />}</For>
      </ul>
      <Show when={hidden() > 0 || all()}>
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          aria-label={all() ? t('sidebar.showFewer') : t('sidebar.showAll', { count: props.conversations.length })}
          class={`w-full py-1 text-left font-mono text-label text-faint transition-colors hover:bg-surface-2 hover:text-foreground ${RAIL_ROW}`}
        >
          {all() ? t('sidebar.showFewer') : t('sidebar.more', { count: hidden() })}
        </button>
      </Show>
    </>
  )
}

/**
 * What was put away, across every folder. It is a section of its own rather than a fold inside
 * each folder: archiving is meant to get something out of the way, and a tail on every folder
 * would be more of the thing the user just tidied. Sending a message brings one back. Its rows
 * carry the folder they rest in at the row's end, because the folder is not on screen here.
 */
export function ArchivedSection(props: { conversations: ConversationSummary[] }) {
  const t = useText()
  const [open, setOpen] = createSignal(false)
  const [all, setAll] = createSignal(false)

  const shown = () => (all() ? props.conversations : props.conversations.slice(0, SHOWN))
  const hidden = () => props.conversations.length - shown().length

  return (
    <Show when={props.conversations.length > 0}>
      <section class="mt-2 pt-1">
        <button
          type="button"
          aria-expanded={open()}
          aria-label={open() ? t('sidebar.collapseArchived') : t('sidebar.expandArchived')}
          title={t('sidebar.archivedHint')}
          onClick={() => setOpen((value) => !value)}
          class={`flex w-full items-center gap-1 py-1.5 text-left text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${RAIL_ROW}`}
        >
          <ChevronDownIcon class={`transition-transform ${open() ? '' : '-rotate-90'}`} />
          <span class="ml-1 min-w-0 flex-1 truncate font-text text-name">{t('sidebar.archived')}</span>
          <span class="font-mono text-label text-faint">{props.conversations.length}</span>
        </button>
        <Show when={open()}>
          <ul class="space-y-0.5">
            <For each={shown()}>
              {(conversation) => (
                <ConversationRow conversation={conversation} detail={folderName(conversation.workspacePath)} archived />
              )}
            </For>
          </ul>
          <Show when={hidden() > 0}>
            <button
              type="button"
              onClick={() => setAll(true)}
              aria-label={t('sidebar.showAll', { count: props.conversations.length })}
              class={`w-full py-1 text-left font-mono text-label text-faint transition-colors hover:bg-surface-2 hover:text-foreground ${RAIL_ROW}`}
            >
              {t('sidebar.more', { count: hidden() })}
            </button>
          </Show>
        </Show>
      </section>
    </Show>
  )
}
