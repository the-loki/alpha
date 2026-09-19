/**
 * The geometry of the page (C5.4), in one place because four components have to agree on it: the
 * transcript, the entries in it, the empty state and the composer. Two columns — a leading column
 * that carries an entry's number, and the text block — so every entry starts at the same x and the
 * numbers read as a column rather than as a ragged edge.
 *
 * The margin is a column and not a rule: the page is a soft surface (ADR-0017), and the number
 * alone is enough to say "this is the numbered line the work hangs off". `PAGE` is the page's own
 * padding, `BLOCK` is the pair of columns everything that carries text is built on.
 */
export const PAGE = 'px-6'
export const BLOCK = 'flex gap-4'
/** The leading column: numbers are right-aligned in it, so two digits and one line up. */
export const MARK_COLUMN = 'w-6 shrink-0 pt-1 text-right font-mono text-micro text-parchment-faint'

/** Two digits, so a column of numbers in the margin is a column and not a ragged edge. */
export function entryNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}
