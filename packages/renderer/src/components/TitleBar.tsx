import { Link } from '@tanstack/react-router'
import { useShell } from '../stores/shell.ts'
import { LevelChip } from './LevelChip.tsx'

function WindowControls() {
  const platform = useShell((state) => state.platform)
  const maximized = useShell((state) => state.windowMaximized)
  const bridge = window.alpha
  if (platform === 'darwin') return null

  return (
    <div className="no-drag flex items-center">
      <button
        type="button"
        aria-label="Minimize window"
        onClick={() => void bridge?.sendWindowCommand('minimize')}
        className="grid h-8 w-10 place-items-center text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
        onClick={() => void bridge?.sendWindowCommand('toggle-maximize')}
        className="grid h-8 w-10 place-items-center text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Close window"
        onClick={() => void bridge?.sendWindowCommand('close')}
        className="grid h-8 w-10 place-items-center text-parchment-dim transition-colors hover:bg-danger hover:text-ink-900"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}

export function TitleBar() {
  const workspace = useShell((state) => state.workspace)
  const name = workspace.kind === 'selected' ? workspace.workspace.name : 'No workspace'

  return (
    <header className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-line bg-ink-800 pl-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[13px] font-semibold tracking-wide text-parchment">Alpha</span>
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <span
          className="truncate text-[12px] text-parchment-dim"
          title={workspace.kind === 'selected' ? workspace.workspace.path : ''}
        >
          {name}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="no-drag rounded-control px-2 py-1 text-[12px] text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          Settings
        </Link>
        <LevelChip />
        <WindowControls />
      </div>
    </header>
  )
}
