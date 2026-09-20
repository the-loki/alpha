/**
 * The geometry of the page (C5.4), in one place because four components have to agree on it: the
 * transcript, the entries in it, the empty state and the composer. Two columns — a leading column
 * that carries an entry's number, and the text block — so every entry starts at the same x and the
 * numbers read as a column rather than as a ragged edge.
 *
 * The margin is a column and not a rule: the page is a soft surface (ADR-0017), and the number
 * alone is enough to say "this is the numbered line the work hangs off". `PAGE` is the page's own
 * padding — the page itself is the reading column, so its width is the root layout's business —
 * and `BLOCK` is the pair of columns everything that carries text is built on.
 */
export const PAGE = 'px-6'
export const BLOCK = 'flex gap-4'
/** The leading column: numbers are right-aligned in it, so two digits and one line up. */
export const MARK_COLUMN = 'w-6 shrink-0 pt-1 text-right font-mono text-micro text-parchment-faint'

/**
 * A column that scrolls, and reserves the wheel's room whether or not the wheel is there. Without the
 * reservation, a list that grows past the fold moves every row in it 8px sideways at the moment it
 * grows — which is the moment a person is reading it.
 */
export const SCROLLS = 'overflow-y-auto [scrollbar-gutter:stable]'

/**
 * And the padding for what stands *beside* such a column: the band that names the page, the composer
 * the next message is written in, the way back above the tasks. None of those scroll, so none of them
 * loses anything to a wheel; the column reserves the wheel's 0.5rem always; so these give up the same
 * 0.5rem on purpose — otherwise every row in the page ends 8px short of the band above it, and the
 * page's own right edge moves the moment a transcript grows past the fold (C5.4).
 */
export const BESIDE_SCROLLS = `${PAGE} pr-8`

/**
 * The panel beside the page: the rail on the workbench, the menu in settings. One class because
 * they are one panel in one slot — the window has two surfaces and never a third, so settings
 * swaps this rather than nesting a menu inside the page (C5.4).
 */
export const PANEL = 'flex w-64 shrink-0 flex-col rounded-card bg-ink-800 px-2 pb-2'

/**
 * The band a page wears at the top: what this page is, and the controls that act on the page rather
 * than on one thing in it. One height and one padding for every page — the conversation, the tasks,
 * a settings panel — so moving between them does not move the title, and the rule under the band is
 * drawn on the same line in all three (C5.4).
 */
export const BAND = `flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line ${BESIDE_SCROLLS}`

/** Two digits, so a column of numbers in the margin is a column and not a ragged edge. */
export function entryNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}
