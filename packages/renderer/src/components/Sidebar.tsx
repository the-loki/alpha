import { type ConversationSummary, type FolderNode, folderTree, formatAge } from '@alpha/core'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { composerFolderOf, NO_FOLDER_PICKER, useShell } from '../stores/shell.ts'
import { ChevronDownIcon, FolderIcon, GearIcon, PlusIcon, SearchIcon } from './icons.tsx'

/** The three states a conversation can be in, told apart by colour and by a word. */
const STATE = {
  idle: { dot: 'bg-line-strong', word: 'idle' },
  running: { dot: 'bg-accent', word: 'working' },
  waiting: { dot: 'bg-amber', word: 'waiting for you' },
} as const

const plural = (count: number) => `${count} ${count === 1 ? 'conversation' : 'conversations'}`

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const activeId = useConversations((state) => state.activeId)
  const rename = useConversations((state) => state.rename)
  const remove = useConversations((state) => state.remove)
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const state = STATE[conversation.status]
  const age = formatAge(conversation.updatedAt, Date.now())

  if (renaming) {
    return (
      <li className="px-1 py-0.5">
        <input
          // biome-ignore lint/a11y/noAutofocus: renaming is deliberate, and the field is the whole act.
          autoFocus
          value={title}
          aria-label="Conversation title"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => setRenaming(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setRenaming(false)
            if (event.key !== 'Enter') return
            const next = title.trim()
            setRenaming(false)
            if (next !== '' && next !== conversation.title) void rename(conversation.id, next)
          }}
          className="w-full rounded-control border border-line-strong bg-ink-900 px-2 py-1 text-code text-parchment focus:outline-none"
        />
      </li>
    )
  }

  return (
    <li className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() => void navigate({ to: '/c/$conversationId', params: { conversationId: conversation.id } })}
        aria-current={conversation.id === activeId}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-control py-1.5 pr-2 pl-7 text-left transition-colors ${
          conversation.id === activeId ? 'bg-ink-600 text-parchment' : 'text-parchment-dim hover:bg-ink-600/60'
        }`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-code">{conversation.title}</span>
        <span className="sr-only">{state.word}</span>
      </button>
      {/* The age is the row's metadata, not part of what the button is: inside it, it would read
          as part of the conversation's name and bury it under "just now". */}
      <span className="shrink-0 font-mono text-micro text-parchment-faint group-hover:hidden">{age}</span>
      <button
        type="button"
        aria-label={`Rename ${conversation.title}`}
        onClick={() => setRenaming(true)}
        className="shrink-0 px-1 font-mono text-micro text-parchment-faint opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        rename
      </button>
      <button
        type="button"
        aria-label={`Delete ${conversation.title}`}
        onClick={() => void remove(conversation.id)}
        className="shrink-0 px-1 font-mono text-micro text-parchment-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
      >
        delete
      </button>
    </li>
  )
}

/**
 * One folder and everything asked in it. The sidebar shows every folder the workbench knows at
 * once — that is the shape of the thing, not a mode to switch into — so this is a section, and the
 * only thing that is ever "current" is where the composer's next message lands.
 */
function FolderSection({ folder, current }: { folder: FolderNode; current: boolean }) {
  const selectWorkspace = useShell((state) => state.selectWorkspace)
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
    <section className="mt-0.5" data-workspace={folder.path}>
      <div className="group flex items-center gap-1">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${folder.name}`}
            title={folder.path}
            onClick={() => setCollapsed((value) => !value)}
            className={`flex w-full min-w-0 items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-ui font-medium transition-colors hover:bg-ink-600 ${
              current ? 'text-parchment' : 'text-parchment-dim'
            }`}
          >
            <ChevronDownIcon className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            <FolderIcon className={current ? 'text-accent' : undefined} />
            <span className="min-w-0 truncate">{folder.name}</span>
          </button>
        </h2>
        {/* One slot, two faces: the count is what the folder holds, the plus is what you can do
            with it. They share a box so hovering never moves the folder's name. */}
        <span className="relative flex h-5 w-6 shrink-0 items-center justify-center">
          <span
            className="font-mono text-micro text-parchment-faint transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
            title={plural(count)}
          >
            {count}
          </span>
          <button
            type="button"
            aria-label={`Start a conversation in ${folder.name}`}
            title={`Start a conversation in ${folder.name}`}
            onClick={() => void startHere()}
            className="absolute inset-0 grid place-items-center rounded-control text-parchment-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-ink-600 hover:text-parchment"
          >
            <PlusIcon />
          </button>
        </span>
      </div>

      {!collapsed &&
        (count === 0 ? (
          <p className="py-1 pr-2 pl-7 text-micro text-parchment-faint">No conversations yet</p>
        ) : (
          <ul className="space-y-0.5">
            {folder.conversations.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
          </ul>
        ))}
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
      className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-ui text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
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
  const navigate = useNavigate()
  const conversations = useConversations((state) => state.list)
  const folders = folderTree(recents, conversations)

  return (
    <aside className="flex w-64 shrink-0 flex-col px-2 pb-2">
      <div>
        <ActionRow
          icon={<PlusIcon />}
          label="New conversation"
          detail={composerFolder === undefined ? 'in no folder yet' : `in ${composerFolder.name}`}
          hint={`${modifier}N`}
          onClick={() => void navigate({ to: '/' })}
        />
        {host === 'browser' ? (
          <p className="py-1.5 pr-2 pl-9 text-micro leading-relaxed text-parchment-faint">{NO_FOLDER_PICKER}</p>
        ) : (
          <ActionRow icon={<FolderIcon />} label="Add a folder" onClick={() => void pickWorkspace()} />
        )}
        <ActionRow icon={<SearchIcon />} label="Search" hint={`${modifier}K`} onClick={onSearch} />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 className="text-micro font-medium tracking-wide text-parchment-faint">Folders</h2>
          <span className="font-mono text-micro text-parchment-faint">{folders.length}</span>
        </div>

        {folders.length === 0 ? (
          <p className="mt-2 px-2 text-xs leading-relaxed text-parchment-faint">
            Nothing here yet. A folder is where the agent reads and writes; add one and the conversations you have in it
            show up here.
          </p>
        ) : (
          folders.map((folder) => (
            <FolderSection key={folder.path} folder={folder} current={folder.path === composerFolder?.path} />
          ))
        )}
      </div>

      {/* What this window is, at the bottom: the same place the reference puts the account row. */}
      <div className="mt-1 flex items-center gap-2 border-t border-line/70 px-2 pt-2">
        <span className="min-w-0 flex-1 truncate text-micro text-parchment-faint">
          Alpha <span className="font-mono">{version}</span>
        </span>
        <Link
          to="/settings"
          aria-label="Settings"
          className="rounded-control p-1 text-parchment-faint transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <GearIcon />
        </Link>
      </div>
    </aside>
  )
}
