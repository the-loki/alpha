/**
 * The two shapes a button takes in this app, so the same kind of action looks the same wherever
 * it is. The rule behind them: sans is the voice of actions, mono is the voice of data — a path,
 * a count, a shortcut, code — and the two are not mixed up.
 */

/**
 * The height of everything with a body: a button, a chip, a field. One number, because a row that
 * carries two of them at different heights is what makes a window look hand-assembled, and it is
 * on the 0.25rem scale (C5.4). What is inside is centred rather than given its own padding, so a
 * control's height does not move when its words do.
 */
export const CONTROL_HEIGHT = 'h-7'

/** An action that is a word: it carries no chrome, and the hover is what says it is a control. */
export const TEXT_ACTION = 'text-xs text-parchment-dim transition-colors hover:text-parchment'

/** The same, for the one action in a group that destroys something. */
export const DESTRUCTIVE_ACTION = 'text-xs text-parchment-dim transition-colors hover:text-danger'

/** An action that is a thing: it has a body, and it can be pressed without its word being read. */
export const OUTLINED_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center rounded-control border border-line px-3 text-xs text-parchment transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-40`

/**
 * The outlined body in the colour of what it would destroy: the same height, so a row of decisions
 * is one row of one height rather than a ragged line.
 */
export const DESTRUCTIVE_BUTTON = `inline-flex ${CONTROL_HEIGHT} items-center rounded-control border border-danger/40 px-3 text-xs text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40`

/** The outlined body in amber: a decision that is neither the primary nor a refusal. */
export const AMBER_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center rounded-control border border-amber/50 px-3 text-xs text-amber transition-colors hover:bg-amber/10 disabled:opacity-40`

/**
 * The one primary action on a surface, wearing the accent as a lit thing: a gradient from the ember
 * to its darker edge and a little of its own light, so the button reads as the lamp of the panel it
 * is on (C5.4). It is the same height as every other body: the primary is shouted with colour, not
 * with size, because a button that is bigger than the decision beside it is a button out of place.
 */
export const PRIMARY_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center rounded-control bg-gradient-to-b from-accent to-accent-bright px-3 text-xs font-medium text-accent-ink shadow-glow transition-all hover:brightness-110 disabled:opacity-40 disabled:shadow-none`

/**
 * A name with a state on it: the permission level, the model a message will run on. Same height as
 * a button, because with one open they stand in the same row.
 */
export const CHIP = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-control border px-2.5 text-xs`
