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

function Recents() {
  const workspace = useShell((state) => state.workspace)
  const recents = useShell((state) => state.recents)
  const openRecent = useShell((state) => state.openRecent)
  const current = workspace.kind === 'selected' ? workspace.workspace.path : ''
  const others = recents.filter((recent) => recent.path !== current)
  if (others.length === 0) return null

  return (
    <section className="mt-4">
      <h2 className="px-1 text-[11px] font-medium uppercase tracking-wider text-parchment-faint">Recent</h2>
      <ul className="mt-1.5 space-y-0.5">
        {others.map((recent) => (
          <li key={recent.path}>
            <button
              type="button"
              onClick={() => void openRecent(recent.path)}
              title={recent.path}
              className="w-full truncate rounded-control px-2 py-1.5 text-left text-[12px] text-parchment-dim transition-colors hover:bg-ink-700 hover:text-parchment"
            >
              {recent.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-ink-800 p-3">
      <WorkspaceButton />
      <Recents />

      <section className="mt-5 flex min-h-0 flex-1 flex-col">
        <h2 className="px-1 text-[11px] font-medium uppercase tracking-wider text-parchment-faint">Conversations</h2>
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-parchment-faint">
          Nothing here yet. Your first conversation appears the moment you ask the agent something.
        </p>
      </section>
    </aside>
  )
}
