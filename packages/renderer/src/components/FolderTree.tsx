import { type ConversationSummary, conversationCount, type FolderNode, folderName, type TaskNode } from '@alpha/core'
import { useNavigate } from '@solidjs/router'
import { createSignal, For, Show } from 'solid-js'
import { languageOf, shell, shellActions, useText } from '../stores/shell.ts'
import { ConversationRow } from './ConversationRow.tsx'
import { ChevronDownIcon, FolderIcon, PlusIcon } from './icons.tsx'
import { TaskGroup } from './TaskGroup.tsx'

/** What this file is: the rail's index — the folders, their conversations and their tasks, and the
    folded line at the end for what was put away. The rail around it is `Sidebar.tsx`. */

const SHOWN = 8

/**
 * One folder and everything asked in it. The sidebar shows every folder the workbench knows at
 * once — that is the shape of the thing, not a mode to switch into — so this is a section, and the
 * only thing that is ever "current" is where the composer's next message lands.
 */
export function FolderSection(props: {
  folder: FolderNode
  current: boolean
  tasks: TaskNode[]
  /** Whether a rule goes above it: every folder but the first is set apart from the one before. */
  divided: boolean
}) {
  const language = () => languageOf(shell.language)
  const t = useText()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = createSignal(false)
  const count = () => props.folder.conversations.length

  // A folder's own new conversation: the composer points here from now on, and the pane goes back
  // to being the place where the next message starts one.
  const startHere = async () => {
    await shellActions.selectWorkspace(props.folder.path)
    navigate('/')
  }

  return (
    <section
      class={`mt-0.5 ${props.divided ? 'mt-1 border-t border-line pt-1' : ''}`}
      data-workspace={props.folder.path}
    >
      <div class="group flex items-center gap-1">
        <h2 class="min-w-0 flex-1">
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
            class={`flex w-full min-w-0 items-center gap-1 rounded-control px-2 py-1.5 text-left text-ui font-medium transition-colors hover:bg-ink-600 ${
              props.current ? 'text-parchment' : 'text-parchment-dim'
            }`}
          >
            <ChevronDownIcon class={`transition-transform ${collapsed() ? '-rotate-90' : ''}`} />
            {/* Two columns, held by every row in this rail: this one owns the second column
                (the folder glyph) and the third (its name), and the conversation rows below put
                their status dot and title in exactly the same two places. */}
            <span class="ml-1 flex min-w-0 items-center gap-2">
              <FolderIcon class={props.current ? 'text-accent' : undefined} />
              <span class="min-w-0 truncate">{props.folder.name}</span>
            </span>
          </button>
        </h2>
        {/* One slot, two faces: the count is what the folder holds, the plus is what you can do
            with it. They share a box so hovering never moves the folder's name. */}
        <span class="relative flex h-5 w-6 shrink-0 items-center justify-center">
          <span
            class="font-mono text-micro text-parchment-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
            title={conversationCount(language(), count())}
          >
            {count()}
          </span>
          <button
            type="button"
            aria-label={t('sidebar.startIn', { folder: props.folder.name })}
            title={t('sidebar.startIn', { folder: props.folder.name })}
            onClick={() => void startHere()}
            class="absolute inset-0 grid place-items-center rounded-control text-parchment-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-ink-600 hover:text-parchment"
          >
            <PlusIcon />
          </button>
        </span>
      </div>

      <Show when={!collapsed()}>
        {count() === 0 && props.tasks.length === 0 ? (
          <p class="py-1 pr-2 pl-11 text-micro text-parchment-faint">{t('sidebar.noConversations')}</p>
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
 * rather than gone: this is a list for glancing at, and the palette is the one for finding things.
 * The expanded state lives no longer than the window, like every other fold in the rail.
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
          class="w-full rounded-control py-1 pr-2 pl-11 text-left font-mono text-micro text-parchment-faint transition-colors hover:bg-ink-700/60 hover:text-parchment-dim"
        >
          {all() ? t('sidebar.showFewer') : t('sidebar.more', { count: hidden() })}
        </button>
      </Show>
    </>
  )
}

/**
 * What was put away, across every folder (ticket #79). It is a section of its own rather than a
 * fold inside each folder: archiving is meant to get something out of the way, and a tail on every
 * folder would be more of the thing the user just tidied. Sending a message brings one back.
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
          class="flex w-full items-center gap-1 rounded-control px-2 py-1.5 text-left text-ui font-medium text-parchment-dim transition-colors hover:bg-ink-600"
        >
          <ChevronDownIcon class={`transition-transform ${open() ? '' : '-rotate-90'}`} />
          <span class="ml-1 min-w-0 flex-1 truncate">{t('sidebar.archived')}</span>
          <span class="font-mono text-micro text-parchment-faint">{props.conversations.length}</span>
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
              class="w-full rounded-control py-1 pr-2 pl-11 text-left font-mono text-micro text-parchment-faint transition-colors hover:bg-ink-700/60 hover:text-parchment-dim"
            >
              {t('sidebar.more', { count: hidden() })}
            </button>
          </Show>
        </Show>
      </section>
    </Show>
  )
}
