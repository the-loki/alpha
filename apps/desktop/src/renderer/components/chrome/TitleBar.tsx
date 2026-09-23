import { useLocation } from '@solidjs/router'
import { Show } from 'solid-js'
import { bridge } from '../../lib/bridge.ts'
import { foldActions, folded, narrow } from '../../stores/fold.ts'
import { shell, useText } from '../../stores/shell.ts'
import { RailIcon } from '../icons.tsx'

/**
 * The window's own three, at the standard control height — 2rem, the same body a button or a field
 * has — because the corner of the window is not a row of small marks but a row of controls (C5.4).
 */
const WINDOW_BUTTON =
  'grid h-8 w-8 place-items-center text-muted transition-colors hover:bg-surface-1 hover:text-foreground'

/**
 * The window's own three, and the one place they are drawn: at the right end of every page's view
 * head — the corner of the window, where a frameless window is closed. A browser has no window of
 * ours to move, and macOS draws its own controls anyway (C5.4).
 */
export function WindowControls() {
  const t = useText()
  const client = bridge()
  const ours = () => shell.host !== 'browser' && shell.platform !== 'darwin'

  return (
    <Show when={ours()}>
      <span class="no-drag flex items-center gap-0.5">
        <button
          type="button"
          aria-label={t('window.minimize')}
          onClick={() => void client.sendWindowCommand('minimize')}
          class={WINDOW_BUTTON}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={shell.windowMaximized ? t('window.restore') : t('window.maximize')}
          onClick={() => void client.sendWindowCommand('toggle-maximize')}
          class={WINDOW_BUTTON}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={t('window.close')}
          onClick={() => void client.sendWindowCommand('close')}
          class={`${WINDOW_BUTTON} hover:bg-danger hover:text-danger-ink`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
      </span>
    </Show>
  )
}

/** The two names this control can wear: the rail's, and the settings menu's — the same control over
 * the column settings keeps (C5.4). */
const RAIL_KEYS = { show: 'sidebar.showRail', hide: 'sidebar.hideRail' } as const
const MENU_KEYS = { show: 'settings.showMenu', hide: 'settings.hideMenu' } as const

/**
 * The column's own control: one glyph, and a name that says which way it will move the column — hide
 * or show (C5.4). The rail folds completely, so this button and ⌘/Ctrl-B are the only ways it comes
 * back, and the view head carries it at its left end. A caller that puts it in a head parks it in
 * the head's own left padding, so the page's title keeps the x its messages and its writing box
 * stand on; a caller in the corner's own row leaves it in the flow. `menu` names the settings menu
 * instead: on a phone that menu is the column, and the control that shows it stands in the panel's
 * own head.
 */
export function RailToggle(props: { menu?: boolean }) {
  const t = useText()
  const keys = () => (props.menu === true ? MENU_KEYS : RAIL_KEYS)
  const label = () => t(folded() ? keys().show : keys().hide)

  return (
    <button
      type="button"
      onClick={foldActions.toggle}
      aria-label={label()}
      title={label()}
      class="no-drag grid h-6 w-6 shrink-0 place-items-center text-muted transition-colors hover:bg-surface-1 hover:text-foreground"
    >
      <RailIcon />
    </button>
  )
}

/**
 * The masthead of the rail, and the window's one banner: the app's name in the apparatus voice,
 * with the whole of it a drag handle — with a page's view head, this is how a frameless window is
 * moved. The window's own controls do not live here: they are the window's corner, and the corner
 * is the top right (C5.4).
 *
 * On a phone this banner is also a head. The column is the whole screen there, so this row is where
 * the column is left by, and it carries the toggle every view head carries (C5.4).
 */
export function SpineHead() {
  const location = useLocation()
  const menu = () => location.pathname.startsWith('/settings')

  return (
    <header class="drag-region flex h-12 shrink-0 items-center gap-2 border-b border-line pl-3">
      <span class="drag-region flex items-center gap-2" title={`Alpha ${shell.appVersion}`}>
        <span class="font-mono text-label tracking-[0.2em] text-foreground">ALPHA</span>
      </span>
      <Show when={narrow()}>
        <span class="no-drag ml-auto pr-3">
          <RailToggle menu={menu()} />
        </span>
      </Show>
    </header>
  )
}
