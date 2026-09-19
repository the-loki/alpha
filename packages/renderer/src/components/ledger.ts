/**
 * The geometry of the page (C5.4), in one place because four components have to agree on it: the
 * transcript, the entries in it, the empty state and the composer. Three columns, and every part
 * of the sheet that carries text uses them — so the rule down the margin is one continuous line
 * from the first entry's number to the prompt mark at the foot of the window.
 *
 * `PAGE` is the page's own padding, and its left side is the margin column's full width: that is
 * what keeps a stamp inside the sheet rather than hanging off it (`-left-12` measured from a
 * container already inset by less than that would be clipped by the scroll region). `PAGE_RULE`
 * starts the text block, and its left border is the rule; `MARGIN_MARK` fills the margin column
 * with its right edge a fixed gap from that rule.
 */
export const PAGE = 'pl-12 pr-4'
export const PAGE_RULE = 'border-l border-line pl-6'
export const MARGIN_MARK = 'absolute -left-12 w-12 pr-3 text-right'

/** Two digits, so a column of numbers in the margin is a column and not a ragged edge. */
export function entryNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}
