import { Show } from 'solid-js'
import { folded } from '../../stores/fold.ts'
import { shell } from '../../stores/shell.ts'
import { RailToggle, WindowControls } from './TitleBar.tsx'

/**
 * The corner a page without a view head keeps the window's three in. Two screens have no view head
 * — the workbench before a folder is chosen, and a folder's title page before its first question is
 * asked — and a frameless window has to be closable from both, at the same y and the same x every
 * view head keeps (C5.4). The left end of the same row is where a folded rail is brought back on
 * those screens, so no page strands the rail.
 */
export function WindowCorner() {
  return (
    // The three sit at the window's own corner here exactly as a view head keeps them (C5.4):
    // flush to the edge, past any padding the page's content lives inside.
    <span class="drag-region absolute inset-x-0 top-0 flex h-12 items-center justify-between">
      <span class="no-drag flex w-6 shrink-0 items-center">
        {/* A locked window has no rail to bring back — the unlock screen is the whole window — so
            the way in appears only where a rail is actually waiting behind it. */}
        <Show when={folded() && !shell.locked}>
          <RailToggle />
        </Show>
      </span>
      <WindowControls />
    </span>
  )
}
