# The window is a spine, and the transcript is a conversation

> **Superseded by [ADR-0026](0026-codex-design-language.md)** — kept for the history it records.
Two layout decisions, taken together because they answer the same complaint: the window spent its
chrome in the wrong places, and the transcript carried furniture no one read.

## Context

The first window stacked two rows of chrome across the top — a strip holding the mark and the
window's commands, then the page's own band — before a word of content. Every pixel of that strip
was a pixel the transcript did not get, and its commands were a second place to look for what the
spine already is: a column of navigation. The transcript, meanwhile, carried a numbered leading
column — a folio beside every message — inherited from a design that read the page as a manuscript.
Numbers name nothing: they do not say who spoke, they do not carry state, and a reader scanning a
long conversation never uses them.

## Decision

**One spine, no strip.** The window is a spine and a page in one gutter. The spine is the
workbench's whole left side: the head (the mark, a drag handle), the
places one can go as rows with their keyboard shortcuts, the index of folders and conversations,
and settings pinned at the foot. The page takes everything beside it at the full height of the
window, and its band is the drag handle for the page. Settings swaps the spine's contents, as
before.

**A conversation, not numbered entries.** The transcript is one conversation column, the way the
mainstream LLM workbenches draw one — the form [ZCode v4][zcode] shipped as open source settles
the question, and Alpha draws the same shape in the Iris vocabulary. The reader's words sit in a
**bubble** of the page's own surface, framed, set to the column's right edge, capped by the
measure, and rounded square but for the corner that faces the answer, which is drawn small so the
bubble points at what came of it. Nothing in the bubble is lit — the accent is the workbench's,
not the reader's. The work that answers stands full width and unboxed on the column itself, with
no badge beside it: the voice that answered owns the column. And a tool call is an **inline
summary** in that column — glyph, name, what it touched, how it went — whose arrow appears under
the pointer and stays turned while the call is open, with the audit hanging unboxed beneath it.

**The page fills, and the page is one scroll.** A conversation is written on the page's own pair of
edges — the prose, the code and tables inside it, the tool lines, the bubble, and the composer all
standing on them — and so is a form page. The width went through three shapes before this one: no
width at all, which let a maximized window spread one conversation across two thousand pixels; a
capped column, first centred and then set on the page's own edge, which kept lines readable but
turned every wide window into an island with dead space at its sides and moved with every resize;
and now the page itself, which uses the room and never moves. The only width that survives is a
*sentence's*: the interface's own notes and empty states keep the reading measure, because they are
labels and not content. And the band that names the page and the bar the next message is written in
are both *inside* the page's one scroll — the band pinned to its top, the bar docked at its foot —
so no strip at either end is spent on chrome that never moves, the transcript passes behind both,
and the composer's shell takes no pointer, so a wheel over the air beside it still scrolls the
page.

[zcode]: https://github.com/zai-org/ZCode

**The band is chrome, and chrome does not move.** A page's band is written on the page's own padding
rather than on the page's column, and it is the same x on every page. It was drawn on the column for
a while, and the cost only showed once the window was resized: a conversation's column is centred, so
at nine hundred pixels the conversation's head stood on the page's own padding and at fourteen
hundred it stood a quarter of the way across the window, with the rail beside it never moving. A form
page's column is capped too, and centring it moved that page's head the same way — the whole content
area looked as though something had shifted it sideways. A title is a thing the reader looks for
where they left it, so the head stands on the page and the body stands on its column.

**A form page fills too, and it is read across.** A settings row is a label and the control that
belongs to it; a panel that caps itself leaves the window's right half as dead weight the controls
could have used. What it may not do is centre itself or drift — the band's title stands on the
page's own padding at every width, which is the same complaint the band answers, one level down.

**The rail is a tree.** A row of the rail has one shape, so every name in it stands on one x. What a
row holds is indented one step past it — the step added by the list rather than asked for by the row,
the same step at every level — and a task, which runs *in* a folder, stands one step in from that
folder rather than on the folder's own x, where it would read as another folder.

## Consequences

The window is 44px taller in content than the old layout at the same window size, and every screen
answers to one rule about where its chrome lives: chrome is the spine and the band, and there is no
third place. Nothing in a page's chrome moves when the window does — the band's title and the page's
own edges hold their x at every width — and no page drifts sideways as it grows. The transcript's hierarchy is carried by geometry alone — the bubble on the right
against the column on the left — so nothing in the page competes with the answer's own text. The
laws live in [05-design](../constraints/05-design.md); the vocabulary of `Entry` and `Page` in
`CONTEXT.md` has been updated to match.
