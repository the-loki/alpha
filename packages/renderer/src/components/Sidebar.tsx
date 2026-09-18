import type { ConversationSummary } from '@alpha/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useConversations } from '../stores/conversations.ts'
import { useShell } from '../stores/shell.ts'

function WorkspaceButton() {
  const workspace = useShell((state) => state.workspace)
  const pickWorkspace = useShell((state) => state.pickWorkspace)
  const selected = workspace.kind === 'selected'

  return (
    <button
      type="button"
      onClick={() => void pickWorkspace()}
      className="w-full rounded-card border border-line bg-ink-700 px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-ink-600"
    >
      <span className="block truncate text-[13px] font-medium text-parchment">
        {selected ? workspace.workspace.name : 'Open a folder'}
      </span>
      <span className="mt-0.5 block truncate font-mono text-[11px] text-parchment-faint">
        {selected ? workspace.workspace.path : 'No workspace yet'}
      </span>
    </button>
  )
}

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const activeId = useConversations((state) => state.activeId)
  const navigate = useNavigate()
  const running = conversation.status === 'running'

  return (
    <li>
      <button
        type="button"
        onClick={() => void navigate({ to: '/c/$conversationId', params: { conversationId: conversation.id } })}
        aria-current={conversation.id === activeId}
        className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors ${
          conversation.id === activeId ? 'bg-ink-600 text-parchment' : 'text-parchment-dim hover:bg-ink-700'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${running ? 'bg-ember' : 'bg-line-strong'}`}
          aria-hidden="true"
        />
        <span className="truncate text-[12.5px]">{conversation.title}</span>
        {running && <span className="sr-only">running</span>}
      </button>
    </li>
  )
}

export function Sidebar() {
  const workspace = useShell((state) => state.workspace)
  const conversations = useConversations((state) => state.list)
  const workspacePath = workspace.kind === 'selected' ? workspace.workspace.path : ''
  const visible = conversations.filter((conversation) => conversation.workspacePath === workspacePath)

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-ink-800 p-3">
      <WorkspaceButton />

      <section className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-parchment-faint">Conversations</h2>
          <Link
            to="/"
            className="rounded-control px-1.5 py-0.5 text-[11px] text-parchment-faint transition-colors hover:bg-ink-600 hover:text-parchment"
          >
            New
          </Link>
        </div>
        {visible.length === 0 ? (
          <p className="mt-2 px-1 text-[12px] leading-relaxed text-parchment-faint">
            Nothing here yet. Your first conversation appears the moment you ask the agent something.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-0.5 overflow-y-auto">
            {visible.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
