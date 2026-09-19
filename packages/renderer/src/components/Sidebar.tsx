import { archivedConversations, folderTasks, folderTree, withoutRuns } from '@alpha/core'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { composerFolderOf, useShell, useText } from '../stores/shell.ts'
import { useTasks } from '../stores/tasks.ts'
import { ArchivedSection, FolderSection } from './FolderTree.tsx'
import { ClockIcon, GearIcon, PlusIcon, SearchIcon } from './icons.tsx'

/**
 * How many rows a list shows before it offers the rest. A rail is for scanning, not for scrolling,
 * and the command palette reads the whole list — so nothing folded away here is lost (ticket #86).
 */

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

/**
 * A control that is only its glyph: an action that belongs beside the thing it acts on rather than
 * in a list of its own. Its name is on it for a reader and for the tooltip, since nothing on screen
 * says what a `+` next to a heading does.
 */
function IconAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-control text-parchment-faint transition-colors hover:bg-ink-700/60 hover:text-parchment"
    >
      {icon}
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
      {/* Three groups, told apart by two rules: the one row that starts something, the two that
          go somewhere, then the index of what is here. All four rows are the same size, so the
          rules are the only thing that can say which is which. */}
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
      </div>

      <div className="mt-1.5 border-t border-line pt-1.5">
        <ActionRow icon={<SearchIcon />} label={t('sidebar.search')} hint={`${modifier}K`} onClick={onSearch} />
        <ActionRow icon={<ClockIcon />} label={t('sidebar.tasks')} onClick={() => void navigate({ to: '/tasks' })} />
      </div>

      <div className="mt-1.5 flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-line pt-2">
        {/* The index's own row: what it holds, how much of it, and the one action that belongs to
            the index itself — adding another folder to it. A row of its own for that was a whole
            line of the rail spent on a control, and it read as a fourth thing to go and do. */}
        <div className="flex items-center gap-1 px-2 pb-1">
          <h2 className="min-w-0 flex-1 truncate font-mono text-micro tracking-widest text-parchment-faint uppercase">
            {t('sidebar.folders')}
          </h2>
          <span className="font-mono text-micro text-parchment-faint">{folders.length}</span>
          {host !== 'browser' && (
            <IconAction icon={<PlusIcon />} label={t('sidebar.addFolder')} onClick={() => void pickWorkspace()} />
          )}
        </div>

        {host === 'browser' && (
          <p className="px-2 pb-1 text-micro leading-relaxed text-parchment-faint">{t('sidebar.browserNoPicker')}</p>
        )}

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
