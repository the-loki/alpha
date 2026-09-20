import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { bridge } from '../lib/bridge.ts'
import { composerFolderOf, useShell, useText } from '../stores/shell.ts'
import { ClockIcon, GearIcon, PlusIcon, SearchIcon } from './icons.tsx'

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

/**
 * One command in the strip: a glyph, named for a reader and said again in a tooltip, and separated
 * from its neighbours by a hairline — a strip of glyph buttons is a toolbar, and a toolbar without
 * rules between its items is a row of unlabelled glyphs.
 */
function Command({
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
      aria-label={label}
      title={hint ?? label}
      onClick={onClick}
      className="no-drag grid h-7 w-7 shrink-0 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-ink-700/60 hover:text-parchment"
    >
      {icon}
    </button>
  )
}

/** A hairline between two commands of the strip. */
function Rule() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-line-strong/40" />
}

/**
 * The strip at the top of the window, and the workbench's global commands live here: the mark, then
 * the three things one does from anywhere — start a conversation, search, see the tasks — each in
 * its own ruled place, then the workbench's settings beside the window's own controls. The rail
 * below is the index; this strip is what one does about it.
 */
export function TitleBar({ onSearch, inSettings }: { onSearch: () => void; inSettings: boolean }) {
  const t = useText()
  const navigate = useNavigate()
  const platform = useShell((state) => state.platform)
  const version = useShell((state) => state.appVersion)
  const composerFolder = useShell(composerFolderOf)
  const modifier = platform === 'darwin' ? '⌘' : 'Ctrl+'

  const newConversationHint = composerFolder
    ? `${t('sidebar.newConversationIn', { folder: composerFolder.name })} · ${modifier}N`
    : `${t('sidebar.newConversationNowhere')} · ${modifier}N`

  return (
    <header className="drag-region flex h-10 shrink-0 items-center justify-between pl-2.5">
      <div className="flex items-center">
        <span className="drag-region flex items-center gap-2 pr-1.5" title={`Alpha ${version}`}>
          <span
            aria-hidden="true"
            className="grid h-4.5 w-4.5 place-items-center rounded-control bg-accent font-mono text-micro text-accent-ink"
          >
            A
          </span>
          <span className="font-mono text-micro tracking-widest text-parchment-dim uppercase">Alpha</span>
        </span>

        <Rule />
        <Command
          icon={<PlusIcon />}
          label={t('sidebar.newConversation')}
          hint={newConversationHint}
          onClick={() => void navigate({ to: '/' })}
        />
        <Rule />
        <Command
          icon={<SearchIcon />}
          label={t('sidebar.search')}
          hint={`${t('sidebar.search')} · ${modifier}K`}
          onClick={onSearch}
        />
        <Rule />
        <Command icon={<ClockIcon />} label={t('sidebar.tasks')} onClick={() => void navigate({ to: '/tasks' })} />
        <Rule />
      </div>

      <div className="flex items-center">
        {!inSettings && (
          <Link
            to="/settings"
            aria-label={t('settings.open')}
            title={t('settings.open')}
            className="no-drag mr-1 grid h-7 w-7 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-ink-700/60 hover:text-parchment"
          >
            <GearIcon />
          </Link>
        )}
        <WindowControls />
      </div>
    </header>
  )
}
