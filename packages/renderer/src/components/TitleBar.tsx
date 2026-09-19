import { bridge } from '../lib/bridge.ts'
import { useShell, useText } from '../stores/shell.ts'

function WindowControls() {
  const platform = useShell((state) => state.platform)
  const host = useShell((state) => state.host)
  const maximized = useShell((state) => state.windowMaximized)
  const t = useText()
  const client = bridge()
  // A browser has no window of ours to move, and macOS draws its own controls anyway.
  if (host === 'browser' || platform === 'darwin') return null

  return (
    <div className="no-drag flex items-center">
      <button
        type="button"
        aria-label={t('window.minimize')}
        onClick={() => void client.sendWindowCommand('minimize')}
        className="grid h-8 w-10 place-items-center text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? t('window.restore') : t('window.maximize')}
        onClick={() => void client.sendWindowCommand('toggle-maximize')}
        className="grid h-8 w-10 place-items-center text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={t('window.close')}
        onClick={() => void client.sendWindowCommand('close')}
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
  return (
    <header className="drag-region flex h-9 shrink-0 items-stretch justify-between border-b border-line bg-ink-800 pl-3">
      {/* The workbench's mark: a stamped square and its name, small enough to read as a publisher's
          line rather than as a product name (C5.5). It is the only place the app signs the page. */}
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid h-4 w-4 place-items-center bg-accent font-mono text-micro text-accent-ink"
        >
          A
        </span>
        <span className="font-mono text-micro tracking-widest text-parchment-dim uppercase">Alpha</span>
      </span>

      {/* The window's own chrome and nothing else: the permission level lives at the foot of the
          composer, which is where the message it governs is written. */}
      <WindowControls />
    </header>
  )
}
