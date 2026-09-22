/**
 * The shapes an action takes in this app, so the same kind of action looks the same wherever it
 * is. The rule behind them: sans is the voice of actions, mono is the voice of data — a path, a
 * count, a shortcut, code — and the two are not mixed up.
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

/**
 * The outlined body in the accent: something the app offers to do *for* you rather than telling you how
 * to do it yourself. It is the third of the tinted siblings — with the amber of a decision and the
 * danger of a refusal — and its pointer answer is its own colour, deepened (C5.6).
 */
export const ACCENT_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center rounded-control border border-accent/50 bg-accent/10 px-3 text-xs text-accent transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40`

/** The outlined body in amber: a decision that is neither the primary nor a refusal. */
export const AMBER_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center rounded-control border border-amber/50 px-3 text-xs text-amber transition-colors hover:bg-amber/10 disabled:opacity-40`

/**
 * The one primary action on a surface, wearing the accent as a lit thing: a gradient from the
 * signal to its deeper edge and a little of its own light, so the button reads as the lamp of the
 * panel it is on (C5.4). It is the same height as every other body: the primary is shouted with
 * colour, not with size, because a button that is bigger than the decision beside it is a button
 * out of place.
 */
export const PRIMARY_ACTION = `inline-flex ${CONTROL_HEIGHT} items-center rounded-control bg-gradient-to-b from-accent to-accent-bright px-3 text-xs font-medium text-accent-ink shadow-glow transition-all hover:brightness-110 disabled:opacity-40 disabled:shadow-none`

/**
 * A control that is only its glyph: the window's own controls, the strip's commands, a heading's
 * `+`. One box everywhere — a 1.25rem glyph beside a 1.75rem one is two designs.
 */
export const ICON_ACTION = `grid ${CONTROL_HEIGHT} w-7 shrink-0 place-items-center rounded-control text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment`

/**
 * A field's frame, without its size or its voice: a form field is mono and one height, a box you
 * write a message in is body text and taller, and both are this edge on this surface. The seven
 * fields in the app agree on the frame and differ in the two things they should.
 */
export const FIELD_FRAME = 'rounded-control border border-line bg-ink-700 focus:border-accent/60'

/**
 * The row inside a menu that is the one in force: a tint of the ink the panel is made of (C5.2). The
 * ink and not the palette's greys, because an overlay is a lift off the page in both palettes and the
 * greys are not on the same side of the panel in both: in the dark they would deepen the row back
 * toward the page it just floated off.
 */
export const ROW_CURRENT = 'bg-parchment/16'

/** And the row a pointer is over: the same tint, lighter, so the two never read as the same state. */
export const ROW_HOVER = 'hover:bg-parchment/8'

/**
 * The row you are in, in a list of places: lit by the accent rather than lifted off the rail
 * (C5.6). It has to be a *solid* whisper — the accent blended onto the chrome itself — because the
 * row's own actions are drawn over it on hover, and an alpha wash over an alpha wash doubles into
 * a visible patch. A colour computed from the two tokens follows whichever accent and palette the
 * workbench is in, where a fixed light grey would not.
 */
export const ROW_LIVE = 'bg-[color-mix(in_oklab,var(--color-accent)_9%,var(--color-ink-800))]'

/** The spine the live row carries at its left edge: two stops of light saying "here". */
export const LIVE_SPINE = 'absolute top-1/2 left-1 h-3 w-0.5 -translate-y-1/2 rounded-full bg-accent'

/**
 * A row of the rail, whatever it is: a place one can go, a folder, a conversation, a task, the door to
 * settings. One padding (0.5rem, the row's own edge) and one gap between a glyph and the name it
 * belongs to — because two rows in one rail that hold their names 2px apart are the thing that makes
 * a rail look hand-assembled, and because every row a list holds has to indent by the same step from
 * that padding for the tree to be readable at all (C5.4).
 */
export const RAIL_ROW = 'gap-2.5 px-2'

/**
 * One step in: what a *list* gives every row it holds, so a child is never mistaken for a sibling of
 * its parent. The list adds the step rather than the row asking for it, which is what makes the step
 * the same at every level of the tree — a folder indents its conversations and its tasks, a task
 * indents its runs, and both steps are this one. 1.25rem, the rail's whole hierarchy.
 */
export const RAIL_STEP = 'pl-5'

/**
 * The name of a part of one thing: a panel's section, a group inside a card, the index's own headings,
 * a record's fields (C5.4). Mono, micro, upper case, faint — the voice that says `Folders` and `Gate`,
 * because a form's groups and a record's fields are the same kind of thing: parts of one thing, named.
 */
export const GROUP_LABEL = 'font-mono text-micro tracking-widest text-parchment-faint uppercase'

/**
 * A name with a state on it: the permission level, the model a message will run on. Same height as
 * a button, because with one open they stand in the same row.
 */
export const CHIP = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-control border px-2.5 text-xs`
