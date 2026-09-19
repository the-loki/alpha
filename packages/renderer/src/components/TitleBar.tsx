import { bridge } from '../lib/bridge.ts'
import { useShell, useText } from '../stores/shell.ts'
import { LevelChip } from './LevelChip.tsx'

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
    <header className="drag-region flex h-11 shrink-0 items-center justify-between border-b border-line bg-ink-800 pl-3">
      {/* No folder name here: the workbench works in as many as you have added, and the sidebar is
          where they are. This strip names the app and holds the window controls. */}
      <span className="text-ui font-semibold tracking-wide text-parchment">Alpha</span>

      <div className="flex items-center gap-2">
        {/* Settings is reached from the sidebar, where the reference puts it, and from Ctrl+,. */}
        <LevelChip />
        <WindowControls />
      </div>
    </header>
  )
}
