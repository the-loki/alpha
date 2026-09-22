import { Show } from 'solid-js'
import { bridge } from '../lib/bridge.ts'
import { shell, useText } from '../stores/shell.ts'

/**
 * The window's own buttons are wider than they are tall on a strip, but the spine's head is a row
 * of peers: the same square box every glyph action wears (ICON_ACTION).
 */
const WINDOW_BUTTON = 'grid h-7 w-7 place-items-center rounded-control text-parchment-dim transition-colors'

/**
 * The window's own three, and the one place they are drawn: at the right end of every page's band —
 * the corner of the window, where a frameless window is closed. A browser has no window of ours to
 * move, and macOS draws its own controls anyway.
 */
export function WindowControls() {
  const t = useText()
  const client = bridge()
  // A browser has no window of ours to move, and macOS draws its own controls anyway.
  const ours = () => shell.host !== 'browser' && shell.platform !== 'darwin'

  return (
    <Show when={ours()}>
      <span class="no-drag flex items-center gap-0.5">
        <button
          type="button"
          aria-label={t('window.minimize')}
          onClick={() => void client.sendWindowCommand('minimize')}
          class={`${WINDOW_BUTTON} hover:bg-ink-600 hover:text-parchment`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={shell.windowMaximized ? t('window.restore') : t('window.maximize')}
          onClick={() => void client.sendWindowCommand('toggle-maximize')}
          class={`${WINDOW_BUTTON} hover:bg-ink-600 hover:text-parchment`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={t('window.close')}
          onClick={() => void client.sendWindowCommand('close')}
          class={`${WINDOW_BUTTON} hover:bg-danger hover:text-white`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" stroke-width="1" />
          </svg>
        </button>
      </span>
    </Show>
  )
}

/**
 * The corner a screen without a band keeps the window's three in. Two screens have no band — the
 * workbench before a folder is chosen, and a folder's title page before its first question is asked
 * — and a frameless window has to be closable from both, so each carries the three in a corner of
 * its own, at the same y every band keeps (C5.4).
 */
export function WindowCorner() {
  return (
    <span class="drag-region absolute inset-x-0 top-0 flex h-14 items-center justify-end gap-4 pr-4">
      <WindowControls />
    </span>
  )
}

/**
 * The mark, and the one colour gradient the window signs itself with: the signal running into its
 * own deeper edge, the same light the primary action carries. It is the only place a gradient is
 * drawn as a shape rather than as light (C5.5).
 */
export function Mark() {
  return (
    <span
      aria-hidden="true"
      class="grid h-4.5 w-4.5 place-items-center rounded-control bg-gradient-to-br from-accent to-accent-bright font-mono text-micro font-medium text-accent-ink shadow-glow"
    >
      A
    </span>
  )
}

/**
 * The head of the spine, and the window's one banner: the mark, and the whole of it a drag handle —
 * with the page's band, this is how a frameless window is moved. The window's own controls do not
 * live here: they are the window's corner, and the corner is the top right of the window, which is
 * the right end of the page's band (C5.4). There is no strip above the workbench: identity, commands,
 * the index and settings are one column, and the window's height belongs to the page.
 *
 * The banner role is implicit, and it is why the head stands directly in its panel: a `header`
 * nested inside a complementary or navigation landmark is not a banner by ancestry, so the panel
 * is a plain container and this header is its first child.
 */
export function SpineHead() {
  return (
    <header class="drag-region flex h-14 shrink-0 items-center gap-2 border-b border-line pl-3">
      <span class="drag-region flex items-center gap-2" title={`Alpha ${shell.appVersion}`}>
        <Mark />
        <span class="font-mono text-micro tracking-[0.2em] text-parchment uppercase">Alpha</span>
      </span>
    </header>
  )
}
