/**
 * The shapes an action takes in this app, so the same kind of action looks the same wherever it
 * is. The rule behind them: the text voice speaks what is read — a name, a title, prose — and the
 * mono speaks the apparatus: a label, a button, a chip, a measurement (C5.3). A control is
 * apparatus, so every button here is set in mono, and a row's name — which is a thing, not a
 * command — is set in the text voice where the row is drawn.
 */
import type { Undef } from '@alpha/domain'
import { type Accessor, createEffect, onCleanup } from 'solid-js'

/**
 * The height of everything with a body: a button, a chip, a field. One number, because a row that
 * carries two of them at different heights is what makes a window look hand-assembled (C5.4).
 * What is inside is centred rather than given its own padding, so a control's height does not
 * move when its words do.
 */
export const CONTROL_HEIGHT = 'h-8'

/** The apparatus voice: what a control says and what a label names (C5.3). */
const APPARATUS = 'font-mono text-label font-medium'

/** An action that is a word: it carries no chrome, and the ink pooling under the hand is its answer. */
export const TEXT_ACTION = `${APPARATUS} text-muted transition-colors duration-normal hover:text-foreground hover:underline underline-offset-2`

/** The same, for the one action in a group that destroys something: it answers in danger. */
export const DESTRUCTIVE_ACTION = `${APPARATUS} text-muted transition-colors duration-normal hover:text-danger hover:underline underline-offset-2`

/** An action that is a thing: it has a body, and it can be pressed without its word being read. */
export const OUTLINED_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md border border-line bg-surface-0 px-3 ${APPARATUS} text-foreground transition-colors duration-normal hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-40`

/**
 * The outlined body in the accent — what the app offers to do *for* you, and what destroys. One
 * shape for both, because they are the same ink at the same height: the word says which it is.
 */
export const DANGER_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md border border-danger/60 px-3 ${APPARATUS} text-danger transition-colors duration-normal hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40`

/** The outlined body in warning: a decision that is neither the primary nor a refusal. */
export const WARNING_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md border border-warning/60 px-3 ${APPARATUS} text-warning transition-colors duration-normal hover:bg-warning/10 disabled:opacity-40`

/**
 * The one primary action on a surface: solid accent, the same ink that streams the answer and
 * sends it (C5.5). It is the same height as every other body — the primary is shouted with
 * colour, never with size.
 */
export const PRIMARY_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md bg-accent-strong px-3 ${APPARATUS} text-accent-ink transition-colors duration-normal hover:bg-accent-deep disabled:opacity-40`

/**
 * The refusal beside a primary: no frame at all, so the row keeps one weight — the word and the
 * tint under the hand are the whole control (the approval card's Deny, C5.5).
 */
export const GHOST_DANGER = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md px-3 ${APPARATUS} text-danger transition-colors duration-normal hover:bg-danger/10 disabled:opacity-40`

/**
 * A control that is only its glyph: the rail's own toggles, the folder `+`, a row's menu. One box
 * everywhere — a glyph at one size beside a glyph at another is two designs. This is the small (1.5rem)
 * box for glyph buttons in dense rows; a glyph standing in a row of decisions takes
 * `CONTROL_HEIGHT` instead (C5.4).
 */
export const ICON_ACTION = `grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors duration-normal hover:bg-surface-1 hover:text-foreground`

/**
 * A field's frame, without its size or its voice: a form field is mono and one height, a box you
 * write a message in is text and taller, and both wear this edge on this well. The well it
 * stands in is the only depth in the window (C5.4).
 */
export const FIELD_FRAME = 'rounded-md border border-line bg-surface-1 focus:border-line-strong'

/**
 * The row a pointer is over, on a page: the raised step fills — the same fill the live row
 * wears — so the hand knows it may press (C5.6).
 */
export const ROW_HOVER = 'hover:bg-surface-2'

/**
 * The row you are in, in a list of places: the pointer's own fill plus the accent's margin
 * tick at its left edge (C5.5). `aria-current` is what says it to a reader.
 */
export const ROW_LIVE = 'bg-surface-2'

/**
 * The same two answers inside a floating layer: a menu stands on the floating step, where a
 * surface-2 fill would not read against it, so the row tints with the line instead — dark in
 * the light room, light in the dark (C5.6).
 */
export const MENU_ROW_CURRENT = 'bg-line-subtle'
export const MENU_ROW_HOVER = 'hover:bg-line-subtle'

/** The tick the live row carries at its left edge: the accent's "here", a margin mark (C5.5). */
export const LIVE_SPINE = 'absolute inset-y-0 left-0 w-0.5 bg-accent'

/**
 * A row of the rail, whatever it is: a place one can go, a folder, a conversation, a task, the
 * door to settings. One padding (0.5rem, the row's own edge) and one gap between a glyph and the
 * name it belongs to — so every name in the rail stands on one x (C5.4).
 */
export const RAIL_ROW = 'gap-2 px-2'

/**
 * One step in: what a *list* gives every row it holds, so a child is never mistaken for a sibling
 * of its parent. The list adds the step rather than the row asking for it — 1.25rem, the rail's
 * whole hierarchy.
 */
export const RAIL_STEP = 'pl-5'

/**
 * The name of a part of one thing: a page's section, a group inside a record, the rail's own
 * headings (C5.4). The apparatus voice — mono, micro, sentence case, faint — because a form's
 * groups and a record's fields are the same kind of thing: parts of one thing, named.
 */
export const GROUP_LABEL = `font-mono text-label font-medium text-faint`

/**
 * A name with a state on it: the permission level, the model a message will run on. Same height
 * as a button, because with one open they stand in the same row. The apparatus voice — the chip
 * measures the message rather than saying it — and the radius is the control radius, given here
 * because a chip may be a span, which the base sheet never rounds (C5.4).
 */
export const CHIP = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md border border-line px-2.5 font-mono font-medium`

/**
 * A notice is a line (C5.4): a surface-1 fill, a `border-l-2` bar in the ink the notice speaks in —
 * warning for a warning, danger for a failure — and its own padding. The caller colours the bar.
 */
export const NOTICE = 'border-l-2 bg-surface-1 px-3 py-2'

/**
 * The floating surface a menu opens on: the lifted step (surface-3), a frame, the medium shadow,
 * arriving with its own motion (C5.4). A caller adds where it anchors — `bottom-full mb-2` for a
 * chip on the window's floor, `top-full` for a row's `⋯` — and how wide it is.
 */
export const MENU_SURFACE = 'slip-in absolute z-50 rounded-xl border border-line bg-surface-3 py-1 shadow-medium'

/**
 * What the pointer does to a quiet chip: it brightens the chip's own frame and no more — a chip
 * with no colour of its own answers in its frame (C5.6).
 */
export const CHIP_QUIET =
  'text-xs text-muted transition-colors duration-normal hover:border-line-strong hover:text-foreground'

/**
 * How each tone of the permission level reads in the two-ink palette: the four level stamps —
 * info, warning, success and danger — one semantic hue per level, `full-access` wearing the red
 * because unbounded is the risky one (C5.2). The settings page uses the same map.
 */
export const TONE_CLASS: Record<string, string> = {
  info: 'text-info border-info/50',
  warning: 'text-warning border-warning/50',
  success: 'text-success border-success/50',
  danger: 'text-danger border-danger/50',
}

/** Square state marks, like every dot of state in the window: a mark is the smallest radius (C5.4). */
export const DOT_CLASS: Record<string, string> = {
  info: 'bg-info',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-danger',
}

/**
 * What the pointer does to a chip that carries a tone: brighten its own frame and keep its fill —
 * a chip answers in its frame, because its colour is the level it is named for (C5.6).
 */
export const TONE_HOVER: Record<string, string> = {
  info: 'hover:border-info',
  warning: 'hover:border-warning',
  success: 'hover:border-success',
  danger: 'hover:border-danger',
}

/**
 * How every menu in the app closes: Escape, or a pointer down anywhere outside the element that
 * opened it (C5.4). The listeners exist only while the menu is open, and "outside" is measured
 * from the container itself — a pointer down on what opened the menu is inside it, and toggles.
 * The container is read at event time, so the ref does not have to exist yet when this is called.
 */
export function useDismissed(open: Accessor<boolean>, close: () => void, container: Accessor<Undef<Node>>): void {
  createEffect(() => {
    if (!open()) return
    const onOutside = (event: MouseEvent) => {
      const element = container()
      if (element !== undefined && !element.contains(event.target as Node)) close()
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape)
    onCleanup(() => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEscape)
    })
  })
}
