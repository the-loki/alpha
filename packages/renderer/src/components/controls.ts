/**
 * The two shapes a button takes in this app, so the same kind of action looks the same wherever
 * it is. The rule behind them: sans is the voice of actions, mono is the voice of data — a path,
 * a count, a shortcut, code — and the two are not mixed up.
 */

/** An action that is a word: it carries no chrome, and the hover is what says it is a control. */
export const TEXT_ACTION = 'text-xs text-parchment-dim transition-colors hover:text-parchment'

/** The same, for the one action in a group that destroys something. */
export const DESTRUCTIVE_ACTION = 'text-xs text-parchment-dim transition-colors hover:text-danger'

/** An action that is a thing: it has a body, and it can be pressed without its word being read. */
export const OUTLINED_ACTION =
  'rounded-control border border-line px-3 py-1 text-xs text-parchment transition-colors hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-40'

/**
 * The one primary action on a surface, wearing the accent as a lit thing: a gradient from the ember
 * to its darker edge and a little of its own light, so the button reads as the lamp of the panel it
 * is on (C5.4).
 */
export const PRIMARY_ACTION =
  'rounded-control bg-gradient-to-b from-accent to-accent-bright px-3 py-1.5 text-xs font-medium text-accent-ink shadow-glow transition-all hover:brightness-110 disabled:opacity-40 disabled:shadow-none'
