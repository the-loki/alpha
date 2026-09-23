/**
 * The width a page is written on: the page's own edges, nothing narrower. Both kinds of page —
 * the conversation and the forms — fill whatever the rail leaves them, one padding in, and everything
 * the page holds stands on that one pair of edges: the prose of an answer, the code and tables
 * inside it, a tool line, the reader's slip, the bar the next message is written in, a form's
 * fields. The only width that is capped is a sentence the interface itself writes (C5.3).
 */
export const COLUMN = 'w-full px-6 text-body'

/**
 * The form pages' wrapper: the settings panels and the tasks page, which fill the page the same
 * way the conversation does and differ only in not being a transcript. Kept as a name because the
 * tests hold the pages to their edges by this marker.
 */
export const FORM_COLUMN = 'w-full'

/** The page's own padding, on either edge: where every page's content starts and stops. */
export const PAGE = 'px-6'

/**
 * A column that scrolls, and reserves the wheel's room whether or not the wheel is there. Without
 * the reservation, a list that grows past the fold moves every row in it sideways at the moment it
 * grows — which is the moment a person is reading it (C5.4).
 */
export const SCROLLS = 'overflow-y-auto [scrollbar-gutter:stable]'

/**
 * And the padding for what stands *beside* such a column: the view head, the composer, the way
 * back above the tasks. None of those scroll and none loses anything to a wheel, so they give up
 * the same room on purpose — otherwise the view head's right end lands past the edge the body's
 * own scroll box ends on (C5.4).
 */
export const BESIDE_SCROLLS = `${PAGE} pr-8`

/**
 * The width of the left column, said once: the rail is 16rem and settings takes the same
 * column at the same width, so both read it from here rather than from two spellings that can
 * drift apart (C5.4).
 */
export const RAIL_WIDTH = 'w-64'

/**
 * The rail's column: the workbench's left side on every screen — the places, the folders and their
 * conversations, then settings; the menu in settings. One class because they are one column in one
 * slot: settings swaps this rather than nesting a menu inside the page (C5.4). It folds completely
 * (see `stores/fold.ts`), and the page takes the room it leaves.
 */
export const PANEL = `flex ${RAIL_WIDTH} shrink-0 flex-col border-r border-line bg-surface-0`

/**
 * The same column as a phone shows it: the whole width, and no hairline, because a phone shows one
 * column at a time and a hairline divides nothing when there is nothing beside it (C5.4). Only the
 * width and the rule differ — the column is the same column, in the same slot, on the same surface.
 */
export const PANEL_WHOLE = 'flex w-full shrink-0 flex-col bg-surface-0'

/**
 * The view head a page wears at its top — the first row of the content area, embedded in the page
 * rather than drawn as a strip above it: what this page is, the controls that act on the page
 * rather than on one thing in it, and the rail's toggle at its left end. One height and one padding
 * for every page, so moving between them does not move the title, and the window's own three keep
 * the same y on every page of the workbench. It is also how the window is dragged — the whole top edge —
 * and its interactive children wear `no-drag`. `relative` so the toggle can stand in the head's own
 * left padding without pushing the title off the page's edge (C5.4).
 */
export const VIEW_HEAD =
  'drag-region relative flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line'

/**
 * The rhythm a panel's groups are set on: one rule between one group and the next, and 1.25rem of
 * room between them. It is drawn by the container the groups sit in and not by each group, because
 * a group that has to remember its own separation is a group that will one day forget it (C5.4).
 */
export const PANEL_GROUPS = 'divide-y divide-line [&>*+*]:mt-5'
