# The page, the margin, and the stamp

The window is one full-bleed sheet with a ruled left margin, every entry numbered in that margin,
and one control shape on it: a square stamp. Nothing on the sheet is rounded and nothing on it
floats. Rounding and shadow belong to the two things that genuinely hover over the page — a menu
and the command palette.

## Context

Ember Ink (ADR-0005) fixed the palette, the type scale and the two voices, and by the end of that
work the app was legible, warm, and still shaped like every other agent app: a title bar, a rail of
pill-shaped rows, a rounded card floating inside a grey window, a transcript of chat bubbles, and a
composer in a box. Two passes of refinement — the surface ladder, hairlines between kinds of thing,
the ledger row — improved the reading order without changing that skeleton. A person looking at the
result could not tell what had changed.

The skeleton was the problem. A chat app's shape is: **the window contains a card, the card
contains a conversation.** Everything about it says the conversation is an object inside a
container — margins around it, a shadow under it, rounding on its corners, and a scroll region that
is a box rather than a page. The workbench is not that: it is a folder of work, written in turns,
with an audit trail attached to every turn. That is a document, and a document has a page.

## Decision

**The sheet is the window.** No outer margins, no floating card: `<main>` reaches the window's own
right and bottom edges, and the rail beside it is a column of the same sheet with a rule down its
right edge. Chrome (the stamp strip, a page's head band, the composer band, the rail) is
`--ink-800`; the page is `--ink-700`. The surface ladder of C5.2 survives underneath unchanged.

**The page has a ruled margin, and the margin carries the marks.** Three columns, one geometry,
imported from `components/ledger.ts` and used by the transcript, the entries, the empty state and
the composer: the page edge, the margin column (3rem), the rule, the text block (1.5rem in). An
entry's number is stamped in the margin, right-aligned against the rule; the composer's `❯` is the
same mark in the same column. The rule runs from the first entry to the foot of the composer, and
`min-h-full` on the page is what keeps it running to the bottom of the window when the turns only
fill the top.

**An entry is a ruled log line, not a bubble.** The reader's own words sit in the text block at the
same left edge and the same size as the answer, opened by the number in the margin and closed by a
hairline. Nothing is filled, outlined or aligned to the right: what tells the request from the work
is the number, the rule and the gap. Its actions are revealed on hover, because an entry at rest is
its number, its words and the rule.

**The composer is a command line.** The same three columns, the prompt mark in the margin, the text
starting where every entry's text starts, growing with what is written into it. The band is chrome
and ruled off from the page above it; the words are not in a box, because the page is not a box.

**Chrome is signed once.** The stamp — a small accent square with an `A` — and the wordmark in mono
upper case sit at the top left of the window, and nowhere else except the unlock screen, which is
the only screen that has no window around it.

**A control is a stamp; only an overlay is a card.** `--radius-control` and `--radius-card` are
`0`. Square with a hairline is what a control looks like on paper; `--radius-overlay` (0.5rem) plus
a shadow is what a menu, a select's popup or the command palette look like, because they are the
only things that are not on the page.

## Superseded in part

The *material* decided here — square everywhere, rounding only for overlays, a hairline down the
page's margin — was reversed by [0017](0017-soft-corners-and-the-page-stays.md): it read as crude
rather than as precise. Everything else stands: the page, the ruled margin as a numbered column,
the entry as a log line, the ledger as a table, the composer as a command line.

The composer is a rounded bar with nothing in front of it, so the `❯` this record puts in the
margin — in the columns paragraph, in "The composer is a command line", and in ADR-0017's sentence
about the bar — is not drawn any more. What stands is the decision itself: a numbered margin, one
column of text, and a composer that opens where the words are.

## Consequences

- The conversation's header moves to being a **page head**: one band with the title at
  `text-lg font-semibold`, its quiet facts in mono micro, and the conversation's controls at the
  right. With no conversation open the same band carries the folder the next message lands in, so
  the page is never anonymous.
- **Tool rows are a table.** The columns (glyph, name, summary, approval, status, duration) are
  fixed widths rather than fitted, so a stack of rows lines up: that is the difference between a
  ledger and a list of sentences.
- The **empty state is the page with its first entry unwritten**: `01` in the margin, the sentence
  in the text block. The folder case is no longer centred, because it is a document; the no-folder
  case still is, because it is about the window rather than about a page.
- Settings and tasks keep their own columns — settings a ruled menu beside the panel, tasks a
  measured column on the page — and neither gets the ledger margin, which belongs to a document
  that is being written turn by turn.
- The transcript's scroll element is named `data-region="transcript"`, so a test that measures the
  page's paint cost does not have to guess which `div` inside `main` scrolls.
- One cost is accepted: with the card gone there is no longer a single element that means "the
  conversation" in the DOM. `data-role` stays on the messages and tools, which is what the tests
  and the audit both need.

## Alternatives considered

**Keep the card and make the palette louder.** A bolder accent, a darker rail, more contrast. This
was the previous pass's instinct and it is what failed: colour changes do not change a shape, and
the shape was what made the window look like every other one.

**A ruled-paper background.** Faint horizontal rules across the whole sheet, like a ledger book.
Rejected: at the contrast a hairline needs to be legible it becomes a texture the reader has to
read through, and in the dark palette it either disappears or turns into noise.

**Numbering the conversations in the rail too.** Rejected: the rail's order changes as new
conversations arrive, so its numbers would churn; and inside a folder they mean nothing, because a
folder is a set and not a sequence. The transcript's entries are a sequence — the order they were
asked in is a fact — which is why the numbering belongs there, and only there.

**Indenting the work under its entry.** The ledger's other convention: the work hangs one step in
from the request. Rejected for now: it costs width in the pane where tool output is read, and the
entry's rule plus the gap already separate the two. Worth revisiting if the transcript ever reads
flat.
