import { type ConversationSummary, formatAge, groupByWorkspace, type WorkspaceGroup } from '@alpha/core'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useShell } from '../stores/shell.ts'
import { GearIcon, PlusIcon, SearchIcon } from './icons.tsx'
import { WorkspaceButton } from './WorkspaceMenu.tsx'

/** The three states a conversation can be in, told apart by colour and by a word. */
const STATE = {
  idle: { dot: 'bg-line-strong', word: 'idle' },
  running: { dot: 'bg-accent', word: 'working' },
  waiting: { dot: 'bg-amber', word: 'waiting for you' },
} as const

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const activeId = useConversations((state) => state.activeId)
  const rename = useConversations((state) => state.rename)
  const remove = useConversations((state) => state.remove)
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const state = STATE[conversation.status]

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
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors ${
          conversation.id === activeId ? 'bg-ink-600 text-parchment' : 'text-parchment-dim hover:bg-ink-600/60'
        }`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-code">{conversation.title}</span>
        <span className="shrink-0 font-mono text-micro text-parchment-faint group-hover:hidden">
          {formatAge(conversation.updatedAt, Date.now())}
        </span>
        <span className="sr-only">{state.word}</span>
      </button>
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

function Group({ group }: { group: WorkspaceGroup }) {
  return (
    <section className="mt-3" data-workspace={group.path}>
      <h3 className="flex items-baseline justify-between px-2 text-micro text-parchment-faint">
        <span className="truncate font-mono">{group.name}</span>
        <span className="shrink-0">{group.count}</span>
      </h3>
      <ul className="mt-0.5 space-y-0.5">
        {group.conversations.map((conversation) => (
          <ConversationRow key={conversation.id} conversation={conversation} />
        ))}
      </ul>
    </section>
  )
}

/** A row that acts rather than navigates: the reference's sidebar is mostly these. */
function ActionRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-ui text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {hint !== undefined && <span className="shrink-0 font-mono text-micro text-parchment-faint">{hint}</span>}
    </button>
  )
}

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const workspace = useShell((state) => state.workspace)
  const platform = useShell((state) => state.platform)
  const version = useShell((state) => state.appVersion)
  const modifier = platform === 'darwin' ? '⌘' : 'Ctrl+'
  const navigate = useNavigate()
  const conversations = useConversations((state) => state.list)
  const workspacePath = workspace.kind === 'selected' ? workspace.workspace.path : ''
  const groups = groupByWorkspace(conversations)
  const here = groups.filter((group) => group.path === workspacePath)
  const elsewhere = groups.filter((group) => group.path !== workspacePath)

  return (
    <aside className="flex w-64 shrink-0 flex-col px-2 pb-2">
      <div className="pb-2">
        <ActionRow
          icon={<PlusIcon />}
          label="New conversation"
          hint={`${modifier}N`}
          onClick={() => void navigate({ to: '/' })}
        />
        <ActionRow icon={<SearchIcon />} label="Search" hint={`${modifier}K`} onClick={onSearch} />
      </div>

      <WorkspaceButton />

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 className="text-micro font-medium tracking-wide text-parchment-faint">Conversations</h2>
          <span className="font-mono text-micro text-parchment-faint">{conversations.length}</span>
        </div>

        {conversations.length === 0 ? (
          <p className="mt-2 px-2 text-xs leading-relaxed text-parchment-faint">
            Nothing here yet. Your first conversation appears the moment you ask the agent something.
          </p>
        ) : (
          <>
            {here.map((group) => (
              <Group key={group.path} group={group} />
            ))}
            {elsewhere.length > 0 && (
              <h2 className="mt-4 px-2 text-micro font-medium tracking-wide text-parchment-faint">Other workspaces</h2>
            )}
            {elsewhere.map((group) => (
              <Group key={group.path} group={group} />
            ))}
          </>
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
