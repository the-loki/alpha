/**
 * The width a page is written on: the page's own edges, nothing narrower. Both kinds of page — the
 * conversation and the forms — fill whatever the rail leaves, one padding in, and everything the page
 * holds stands on that one pair of edges: the prose of an answer, the code and tables inside it, a
 * tool line, the reader's bubble at the right end, the bar the next message is written in, a form's
 * fields and cards.
 *
 * Both were capped for a while — the conversation at the reading measure, the forms at 56rem — and
 * then centred, and then left-aligned, and each step traded one complaint for another: the cap turned
 * a wide window into a narrow island with dead space at its sides, the centring moved the sentence
 * the reader was reading every time the window changed width, and the left-aligned cap left the
 * page's right half empty. What the reader actually asked for, all three times, was the same thing:
 * use the room, and never move. So the page fills, and the only width left in the app is the one a
 * *sentence* keeps — `max-w-measure`, the reading measure, on the lines the interface itself writes
 * (a panel's note, an empty state, a hint), which are labels and not content (C5.3, C5.4).
 */
export const COLUMN = 'w-full px-6 text-body'

/**
 * The form pages' wrapper: the settings panels and the tasks page, which fill the page the same way
 * the conversation does and differ only in not being a transcript. Kept as a name because the pages
 * reach the same edges by their own route — band beside the scroll, body inside it — and the tests
 * hold them to it by this marker.
 */
export const FORM_COLUMN = 'w-full'

/** The page's own padding, on either edge: where every page's content starts and stops. */
export const PAGE = 'px-6'

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
 * drawn on the same line in all three (C5.4). The band is also how the window is dragged: with no
 * strip above the workbench, a page's own name is the handle, so it is a drag region and its
 * interactive children wear `no-drag`.
 */
export const BAND = 'drag-region flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line'

/**
 * The rhythm a panel's groups are set on: one rule between one group and the next, and 1.25rem of
 * room between them, so two groups read as two and never as one run of text. It is drawn by the
 * container the groups sit in and not by each group, because a group that has to remember its own
 * separation is a group that will one day forget it — which is how a notice came to sit with its last
 * line on the sentence of the group beneath it. The container that holds a *panel* wears it, and so
 * does the container that holds that panel's own groups: the rhythm reaches as deep as the grouping
 * does, and no further (C5.4).
 *
 * The room is a margin on the group below rather than padding inside it, and that is deliberate: a
 * group is often a card, and a card's inset is its own — a lead-in written as padding on the group
 * would land on top of the card's own `p-4` and take its top inset away from it, which is a panel
 * whose cards are inset 1rem on three sides and 1.25rem on the fourth.
 */
export const PANEL_GROUPS = 'divide-y divide-line [&>*+*]:mt-5'
