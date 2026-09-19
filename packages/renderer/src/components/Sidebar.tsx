import {
  archivedConversations,
  type ConversationSummary,
  conversationCount,
  type FolderNode,
  folderName,
  folderTasks,
  folderTree,
  type TaskNode,
  withoutRuns,
} from '@alpha/core'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { composerFolderOf, languageOf, useShell, useText } from '../stores/shell.ts'
import { useTasks } from '../stores/tasks.ts'
import { ConversationRow } from './ConversationRow.tsx'
import { ChevronDownIcon, ClockIcon, FolderIcon, GearIcon, PlusIcon, SearchIcon } from './icons.tsx'
import { TaskGroup } from './TaskGroup.tsx'

/**
 * How many rows a list shows before it offers the rest. A rail is for scanning, not for scrolling,
 * and the command palette reads the whole list — so nothing folded away here is lost (ticket #86).
 */
const SHOWN = 8

/**
 * One folder and everything asked in it. The sidebar shows every folder the workbench knows at
 * once — that is the shape of the thing, not a mode to switch into — so this is a section, and the
 * only thing that is ever "current" is where the composer's next message lands.
 */
function FolderSection({
  folder,
  current,
  tasks,
  divided,
}: {
  folder: FolderNode
  current: boolean
  tasks: TaskNode[]
  /** Whether a rule goes above it: every folder but the first is set apart from the one before. */
  divided: boolean
}) {
  const selectWorkspace = useShell((state) => state.selectWorkspace)
  const language = useShell((state) => languageOf(state.language))
  const t = useText()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const count = folder.conversations.length

  // A folder's own new conversation: the composer points here from now on, and the pane goes back
  // to being the place where the next message starts one.
  const startHere = async () => {
    await selectWorkspace(folder.path)
    await navigate({ to: '/' })
  }

  return (
    <section className={`mt-0.5 ${divided ? 'mt-1 border-t border-line pt-1' : ''}`} data-workspace={folder.path}>
      <div className="group flex items-center gap-1">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={
              collapsed ? t('sidebar.expand', { folder: folder.name }) : t('sidebar.collapse', { folder: folder.name })
            }
            title={folder.path}
            onClick={() => setCollapsed((value) => !value)}
            className={`flex w-full min-w-0 items-center gap-1 rounded-control px-2 py-1.5 text-left text-ui font-medium transition-colors hover:bg-ink-600 ${
              current ? 'text-parchment' : 'text-parchment-dim'
            }`}
          >
            <ChevronDownIcon className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            {/* Two columns, held by every row in this rail: this one owns the second column
                (the folder glyph) and the third (its name), and the conversation rows below put
                their status dot and title in exactly the same two places. */}
            <span className="ml-1 flex min-w-0 items-center gap-2">
              <FolderIcon className={current ? 'text-accent' : undefined} />
              <span className="min-w-0 truncate">{folder.name}</span>
            </span>
          </button>
        </h2>
        {/* One slot, two faces: the count is what the folder holds, the plus is what you can do
            with it. They share a box so hovering never moves the folder's name. */}
        <span className="relative flex h-5 w-6 shrink-0 items-center justify-center">
          <span
            className="font-mono text-micro text-parchment-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
            title={conversationCount(language, count)}
          >
            {count}
          </span>
          <button
            type="button"
            aria-label={t('sidebar.startIn', { folder: folder.name })}
            title={t('sidebar.startIn', { folder: folder.name })}
            onClick={() => void startHere()}
            className="absolute inset-0 grid place-items-center rounded-control text-parchment-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-ink-600 hover:text-parchment"
          >
            <PlusIcon />
          </button>
        </span>
      </div>

      {!collapsed && (
        <>
          {count === 0 && tasks.length === 0 ? (
            <p className="py-1 pr-2 pl-11 text-micro text-parchment-faint">{t('sidebar.noConversations')}</p>
          ) : (
            <ConversationList conversations={folder.conversations} />
          )}

          {/* The tasks that run in this folder, each with the conversations its runs made. A folder
              with no tasks grows no row: an empty group is noise for everyone who never makes one. */}
          {tasks.map((node) => (
            <TaskGroup key={node.task.id} node={node} />
          ))}
        </>
      )}
    </section>
  )
}

/**
 * A folder's conversations, newest first, eight of them at a time. The rest are one click away
 * rather than gone: this is a list for glancing at, and the palette is the one for finding things.
 * The expanded state lives no longer than the window, like every other fold in the rail.
 */
function ConversationList({ conversations }: { conversations: ConversationSummary[] }) {
  const t = useText()
  const [all, setAll] = useState(false)
  const shown = all ? conversations : conversations.slice(0, SHOWN)
  const hidden = conversations.length - shown.length

  return (
    <>
      <ul className="space-y-0.5">
        {shown.map((conversation) => (
          <ConversationRow key={conversation.id} conversation={conversation} />
        ))}
      </ul>
      {(hidden > 0 || all) && (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          aria-label={all ? t('sidebar.showFewer') : t('sidebar.showAll', { count: conversations.length })}
          className="w-full rounded-control py-1 pr-2 pl-11 text-left font-mono text-micro text-parchment-faint transition-colors hover:bg-ink-700/60 hover:text-parchment-dim"
        >
          {all ? t('sidebar.showFewer') : t('sidebar.more', { count: hidden })}
        </button>
      )}
    </>
  )
}

/**
 * What was put away, across every folder (ticket #79). It is a section of its own rather than a
 * fold inside each folder: archiving is meant to get something out of the way, and a tail on every
 * folder would be more of the thing the user just tidied. Sending a message brings one back.
 */
function ArchivedSection({ conversations }: { conversations: ConversationSummary[] }) {
  const t = useText()
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  if (conversations.length === 0) return null

  const shown = all ? conversations : conversations.slice(0, SHOWN)
  const hidden = conversations.length - shown.length

  return (
    <section className="mt-2 pt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t('sidebar.collapseArchived') : t('sidebar.expandArchived')}
        title={t('sidebar.archivedHint')}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1 rounded-control px-2 py-1.5 text-left text-ui font-medium text-parchment-dim transition-colors hover:bg-ink-600"
      >
        <ChevronDownIcon className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="ml-1 min-w-0 flex-1 truncate">{t('sidebar.archived')}</span>
        <span className="font-mono text-micro text-parchment-faint">{conversations.length}</span>
      </button>
      {open && (
        <>
          <ul className="space-y-0.5">
            {shown.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                detail={folderName(conversation.workspacePath)}
                archived
              />
            ))}
          </ul>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setAll(true)}
              aria-label={t('sidebar.showAll', { count: conversations.length })}
              className="w-full rounded-control py-1 pr-2 pl-11 text-left font-mono text-micro text-parchment-faint transition-colors hover:bg-ink-700/60 hover:text-parchment-dim"
            >
              {t('sidebar.more', { count: hidden })}
            </button>
          )}
        </>
      )}
    </section>
  )
}

/** A row that acts rather than navigates: the reference's sidebar is mostly these. */
function ActionRow({
  icon,
  label,
  detail,
  hint,
  onClick,
}: {
  icon: ReactNode
  label: string
  detail?: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-ui text-parchment-dim transition-colors hover:bg-ink-700/60 hover:text-parchment"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {detail !== undefined && <span className="block truncate text-micro text-parchment-faint">{detail}</span>}
      </span>
      {hint !== undefined && <span className="shrink-0 font-mono text-micro text-parchment-faint">{hint}</span>}
    </button>
  )
}

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const recents = useShell((state) => state.recents)
  const platform = useShell((state) => state.platform)
  const version = useShell((state) => state.appVersion)
  const host = useShell((state) => state.host)
  const pickWorkspace = useShell((state) => state.pickWorkspace)
  const composerFolder = useShell(composerFolderOf)
  const modifier = platform === 'darwin' ? '⌘' : 'Ctrl+'
  const t = useText()
  const navigate = useNavigate()
  const conversations = useConversations((state) => state.list)
  const listed = useConversations((state) => state.listed)
  const tasks = useTasks((state) => state.tasks)
  const runs = useTasks((state) => state.runs)
  // A run is a conversation, but it is shown under its task rather than in the folder's own list.
  const folders = folderTree(recents, withoutRuns(conversations, runs))

  return (
    // A soft panel beside the page: the workbench's contents, floating the same distance off the
    // window's edges as the page does (C5.4).
    <aside className="flex w-64 shrink-0 flex-col rounded-card bg-ink-800 px-2 pb-2">
      <div className="pt-1.5">
        <ActionRow
          icon={<PlusIcon />}
          label={t('sidebar.newConversation')}
          detail={
            composerFolder === undefined
              ? t('sidebar.newConversationNowhere')
              : t('sidebar.newConversationIn', { folder: composerFolder.name })
          }
          hint={`${modifier}N`}
          onClick={() => void navigate({ to: '/' })}
        />
        {host === 'browser' ? (
          <p className="px-2 py-1.5 pl-8 text-micro leading-relaxed text-parchment-faint">
            {t('sidebar.browserNoPicker')}
          </p>
        ) : (
          <ActionRow icon={<FolderIcon />} label={t('sidebar.addFolder')} onClick={() => void pickWorkspace()} />
        )}
        <ActionRow icon={<SearchIcon />} label={t('sidebar.search')} hint={`${modifier}K`} onClick={onSearch} />
        <ActionRow icon={<ClockIcon />} label={t('sidebar.tasks')} onClick={() => void navigate({ to: '/tasks' })} />
      </div>

      {/* A rule between doing something and what you have: the rows above act, the index below is
          the workbench's contents. */}
      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto pt-1">
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 className="font-mono text-micro tracking-widest text-parchment-faint uppercase">
            {t('sidebar.folders')}
          </h2>
          <span className="font-mono text-micro text-parchment-faint">{folders.length}</span>
        </div>

        {folders.length === 0
          ? // One line, and only once the list has been read: before that, "nothing here" would be a
            // claim about a file nobody has opened yet.
            listed && <p className="mt-2 px-2 text-xs text-parchment-faint">{t('sidebar.noFolders')}</p>
          : folders.map((folder, index) => (
              <FolderSection
                key={folder.path}
                folder={folder}
                current={folder.path === composerFolder?.path}
                tasks={folderTasks(tasks, runs, conversations, folder.path)}
                divided={index > 0}
              />
            ))}

        <ArchivedSection conversations={archivedConversations(conversations)} />
      </div>

      {/* What this window is, at the bottom: the same place the reference puts the account row. */}
      <div className="mt-1 flex items-center gap-2 px-2 pt-2">
        <span className="min-w-0 flex-1 truncate font-mono text-micro text-parchment-faint">
          Alpha <span>{version}</span>
        </span>
        <Link
          to="/settings"
          aria-label={t('settings.open')}
          className="p-1 text-parchment-faint transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <GearIcon />
        </Link>
      </div>
    </aside>
  )
}
