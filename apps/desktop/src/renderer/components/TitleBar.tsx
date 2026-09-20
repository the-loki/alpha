import { useNavigate } from '@solidjs/router'
import { type JSX, Show } from 'solid-js'
import { bridge } from '../lib/bridge.ts'
import { composerFolderOf, shell, useText } from '../stores/shell.ts'
import { ClockIcon, PlusIcon, SearchIcon, TuneIcon } from './icons.tsx'

function WindowControls() {
  const t = useText()
  const client = bridge()
  // A browser has no window of ours to move, and macOS draws its own controls anyway.
  const ours = () => shell.host !== 'browser' && shell.platform !== 'darwin'

  return (
    <Show when={ours()}>
      <div class="no-drag flex items-center">
        <button
          type="button"
          aria-label={t('window.minimize')}
          onClick={() => void client.sendWindowCommand('minimize')}
          class="grid h-7 w-10 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={shell.windowMaximized ? t('window.restore') : t('window.maximize')}
          onClick={() => void client.sendWindowCommand('toggle-maximize')}
          class="grid h-7 w-10 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={t('window.close')}
          onClick={() => void client.sendWindowCommand('close')}
          class="grid h-7 w-10 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-danger hover:text-ink-900"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
      </div>
    </Show>
  )
}

/**
 * One command in the strip: a glyph, named for a reader and said again in a tooltip, and separated
 * from its neighbours by a hairline — a strip of glyph buttons is a toolbar, and a toolbar without
 * rules between its items is a row of unlabelled glyphs.
 */
function Command(props: { icon: JSX.Element; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.hint ?? props.label}
      onClick={() => props.onClick()}
      class="no-drag grid h-7 w-7 shrink-0 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-ink-700/60 hover:text-parchment"
    >
      {props.icon}
    </button>
  )
}

/** A hairline between two commands of the strip. */
function Rule() {
  return <span aria-hidden="true" class="mx-1 h-4 w-px bg-line-strong/40" />
}

/**
 * The strip at the top of the window, and the workbench's global commands live here: the mark, then
 * the three things one does from anywhere — start a conversation, search, see the tasks — each in
 * its own ruled place, then the workbench's settings beside the window's own controls. The rail
 * below is the index; this strip is what one does about it.
 */
export function TitleBar(props: { onSearch: () => void; inSettings: boolean }) {
  const t = useText()
  const navigate = useNavigate()
  const composerFolder = () => composerFolderOf(shell)
  const modifier = () => (shell.platform === 'darwin' ? '⌘' : 'Ctrl+')

  const newConversationHint = () => {
    const folder = composerFolder()
    return folder !== undefined
      ? `${t('sidebar.newConversationIn', { folder: folder.name })} · ${modifier()}N`
      : `${t('sidebar.newConversationNowhere')} · ${modifier()}N`
  }

  return (
    <header class="drag-region flex h-10 shrink-0 items-center justify-between pl-2.5">
      <div class="flex items-center">
        <span class="drag-region flex items-center gap-2 pr-1.5" title={`Alpha ${shell.appVersion}`}>
          <span
            aria-hidden="true"
            class="grid h-4.5 w-4.5 place-items-center rounded-control bg-accent font-mono text-micro text-accent-ink"
          >
            A
          </span>
          <span class="font-mono text-micro tracking-widest text-parchment-dim uppercase">Alpha</span>
        </span>

        <Rule />
        <Command
          icon={<PlusIcon />}
          label={t('sidebar.newConversation')}
          hint={newConversationHint()}
          onClick={() => navigate('/')}
        />
        <Rule />
        <Command
          icon={<SearchIcon />}
          label={t('sidebar.search')}
          hint={`${t('sidebar.search')} · ${modifier()}K`}
          onClick={props.onSearch}
        />
        <Rule />
        <Command icon={<ClockIcon />} label={t('sidebar.tasks')} onClick={() => navigate('/tasks')} />
        <Rule />
      </div>

      <div class="flex items-center">
        <Show when={!props.inSettings}>
          <a
            href="#/settings"
            aria-label={t('settings.open')}
            title={t('settings.open')}
            class="no-drag mr-1 grid h-7 w-7 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-ink-700/60 hover:text-parchment"
          >
            <TuneIcon />
          </a>
        </Show>
        <WindowControls />
      </div>
    </header>
  )
}
