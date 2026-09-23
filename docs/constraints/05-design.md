# 05 — Design

Alpha must look like a tool someone works in for six hours, not like a landing page. The visual
language is called **Caliper**: an instrument in near-neutral greys with exactly one indigo
signal. The window follows the system theme — both palettes are complete and first-class, the
dark one is the design's first draft. What is read is set in sans; what is operated or measured
is set in mono. Nothing on screen is a costume.

Caliper replaces Codex (ADR-0027): the ruled sheet, rubric red and the print furniture (dot
leaders, dockets, colophons, uppercase labels, the `¶`) retire; the discipline stays — one
window, one height for a body, one content edge, and a pointer that answers in colour and never
moves a box.

## C5.1 — Why near-neutral, and why indigo

Codex bet on a warm press and a scribe's red. Caliper bets on the instrument: the neutrals are
cool, close in lightness (four steps two to three percent apart), and almost hueless — so the
one saturated colour in the window can be the only light in it. That colour is **indigo**, and
it carries exactly the meanings rubric red used to carry: *you are here* (the current row's
margin bar, the selected segment), *happening now* (the streaming caret, the working mark),
*the primary act* (Send, New task, Allow once), *decisive* (the focus ring). **Red is demoted to
danger alone** — failure, destruction, denial — because a red that appears everywhere stops
meaning danger. Structure is *felt, not seen*: hierarchy comes from a surface step and from
space, not from drawing a rule at every joint.

## C5.2 — Tokens

These are the only colours in the app; components reference tokens, never raw hex (asserted
numerically by `tools/design/theme.test.ts`, which reads the palettes out of the stylesheet).

**The window follows the system.** The renderer resolves `prefers-color-scheme` and the saved
choice between the same two palettes; `system` is a choice, not a third theme.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--surface-0` | `#FFFFFF` | `#08090A` | The page: window, rail, content area |
| `--surface-1` | `#F8F8F8` | `#0F1011` | A sunken step: code, inputs, wells |
| `--surface-2` | `#F4F4F4` | `#141516` | A raised step: cards, the approval card, hover rows |
| `--surface-3` | `#F0F0F0` | `#191A1B` | A floating step: menus, the command palette, dialogs |
| `--foreground` | `#282A30` | `#F7F8F8` | Primary text |
| `--muted` | `#3C4149` | `#D0D6E0` | Secondary text, supporting sentences |
| `--tertiary` | `#6F6E77` | `#8A8F98` | Labels, metadata that is still read |
| `--faint` | `#86848D` | `#62666D` | Timestamps, disabled (3:1 only) |
| `--line-subtle` | black 6% | white 6% | A step inside something: a nested frame (a code block, the approval card), a row's tint in a floating layer |
| `--line` | black 12% | white 10% | Input and card frames — and the hairline where kinds meet: the rail from the page, a view head from its body, one group from the next |
| `--line-strong` | black 18% | white 16% | Focused input border |
| `--accent` | `#5E6AD2` | `#7170FF` | Here / now / primary / decisive (see C5.1) |
| `--accent-strong` | `#5E6AD2` | `#5850EC` | The fill under `--accent-ink` on a solid button |
| `--accent-ink` | `#FFFFFF` | `#FFFFFF` | The ink on a filled accent |
| `--accent-hover` | `#4C56C0` | `#8B8AFF` | The accent as text under the pointer (C5.6) |
| `--accent-deep` | `#4C56C0` | `#4943D8` | The accent under the pointer where ink stands on it (C5.6) |
| `--danger` | `#D92D20` | `#FF6161` | Failure, destruction, denial — and nothing else |
| `--danger-ink` | `#FFFFFF` | `#17150F` | The ink on a filled danger control; the dark palette answers near-black, because white on `#FF6161` does not clear 4.5:1 |
| `--success` | `#1A7F37` | `#27A644` | Done, remembered |
| `--warning` | `#A16207` | `#F0BF00` | Waiting on you, caution |
| `--info` | `#175CD3` | `#5EB0FF` | Neutral information |

Borders are transparent overlays, not flat greys, so a frame on `--surface-3` still reads as a
frame. Four surfaces exist; an overlay is `--surface-3` with `--line` and a shadow (C5.4), not
a fifth step.

**Two kinds meeting is the `--line` step, not the subtle one.** The rail and the page, a view head
and its body, one group and the next stand on the same surface, so the hairline is the whole of what
separates them, and a line that is the whole of a separation takes the 12% step: at 6% the boundary
is read only by someone looking for it (12% is `rgb(227 227 227)` on white, 6% is `rgb(242 242 242)`)
and in the dark palette the two steps sit 4% apart. `--line-subtle` is for a step *inside* something,
where a frame already says what it holds. A joint is `--line`; `--line-subtle` is never a joint.

**Permission levels are stamps, and each is a different semantic colour** (no two levels share):

| Level | Token |
| --- | --- |
| `plan` | `--info` |
| `ask` | `--warning` |
| `accept-edits` | `--success` |
| `full-access` | `--danger` |

Every text/background pair above must clear **4.5:1** — every text step against every surface it
stands on, `--accent` and the semantics as text against `--surface-0`, and each ink against the fill
it stands on (`--accent-ink` on `--accent-strong`, `--danger-ink` on `--danger`). `--faint` is
metadata only and still clears 3:1. The level set must be four distinct hues. All of it is asserted
in `theme.test.ts`.

## C5.3 — Type

Two voices, and only two. **The text voice is sans** — Geist Sans, self-hosted (OFL): it is what
is *read* — messages, prose, titles, names, a field's value. **The apparatus voice is mono** —
Geist Mono: it is what is *operated or measured* — labels, buttons, chips, shortcuts, paths,
counts, timestamps, code, tool lines. The whole interface is these two faces at these sizes, set
in rem, so the window's own scale applies:

| Role | Voice | Size / line-height | Weight |
| --- | --- | --- | --- |
| The text: messages, prose, typed values | sans `text-body` | 0.9375rem / 1.55 | 400 |
| A name: a rail row, a task, a heading in content | sans `text-name` | 0.875rem / 1.45 | 400–500 |
| A page's title: what a view head names, and the rail's own heading in Settings | sans `text-page-title` | 1.125rem / 1.3, `tracking-tight` | 500 |
| A heading inside an answer | sans `text-title` | 1.25rem / 1.3, `tracking-tight` | 600 |
| An empty state's display line | sans `text-display` | 1.75rem / 1.25 | 400, or 600 for the greeting a new conversation opens on |
| The apparatus: labels, buttons, chips, section names | mono `text-label` | 0.75rem / 1.4, sentence case | 500 |
| Metadata: paths, counts, shortcuts, timestamps | mono `text-label` | 0.75rem / 1.4 | 400 |
| Code, tool output, diffs, inline code | mono `text-code` | 0.8125rem / 1.6 | 400 |

**A head is chrome, and the page's own words lead it.** The title a view head wears is one step
under the title scale a heading inside an answer wears, and at the emphasis weight — so the 600 in
a window belongs to the page saying something itself: the greeting a new conversation opens on, and
a heading the model wrote. A head that shouts competes with the words it
names, and a mark that only decorates is not what makes a title a title.

**Weights are 400, 500 and 600 — three, not two.** Hierarchy still comes from size, colour and
space; 500 carries UI emphasis and 600 a heading alone. Nothing is bold, black, extrabold, light
or thin, and no `font-weight` may name another number: `05-design:no-other-weights` fails
`pnpm check` on those class names and declarations anywhere under `apps/desktop/src/renderer/`.

**Labels are sentence case, and the apparatus does not shout.** Codex's
`UPPERCASE WIDE-TRACKING` micro labels retire with the print furniture; mono at 0.75rem in
sentence case *is* the label. `05-design:no-uppercase-labels` fails `pnpm check` on `uppercase`
and `tracking-widest` in the renderer. The one thing drawn in capitals is the workbench's own name
in the masthead — a mark rather than a label, written as letters with its own tracking, and not a
shape the interface repeats anywhere else.

There is no third face: `05-design:two-voices` fails `pnpm check` on `font-sans`, `font-serif`,
`font-display` or an arbitrary `font-[…]` anywhere under the renderer — the text voice's name is
`font-text`, and it is backed by Geist Sans. Neither bundled family has CJK glyphs, so Chinese falls
through the stack to the machine's own — `PingFang SC`, `Microsoft YaHei`, `Noto Sans CJK SC`
for the text voice, the system mono CJK for the apparatus — named rather than left to generics so
a Chinese window is drawn in a face someone chose.

**Width.** **The page fills the pane the rail leaves it, one padding in, and everything the page
holds stands on that one pair of edges** — an invariant the window keeps at every width: title,
messages, composer and code all share one left x, and widening the window from the 1200 it opens at
to 2400 moves nothing (asserted by `e2e/design.spec.ts`). The only width that is capped is **a sentence
of the interface** — a hint under a field, an empty state's line: `max-w-measure` (70ch) on lines
that are labels rather than content. An answer's own prose fills the page, because that is the
room the reader asked the window for.

## C5.4 — Space, shape and the skeleton

A 0.25rem base scale, used as `1, 2, 3, 4, 6, 8, 12`. **Radius comes from one scale — 0.25,
0.375, 0.5, 0.75rem** (Tailwind's `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl`,
tokens set to those values): the first for marks and tags, the second for controls and inputs,
the third for cards and the selected row, the fourth for menus, the palette and dialogs. There
is no other radius and no `rounded-full`; `e2e/design.spec.ts` measures every visible control's
radius against this set. Borders are hairlines — the `border` utility's own width, a utility
rather than a length. **Shadows exist only for floating layers**, on a five-token scale
(`none / tiny / low / medium / high`): content cards are `none` and stand on a surface step;
menus and popovers are `medium`; dialogs and the palette are `high`. Shadow offsets and blurs
are rem like every other length: **no `px` appears anywhere in the renderer, comments included**
— a length is rem or a Tailwind utility's own size, and `05-design:no-px-lengths` fails
`pnpm check` on the first one it finds, wherever it hides.

**Controls have two heights** — standard **2rem** (buttons, inputs, selects, chips, a row of
decisions, and the window's own three at the corner) and small **1.5rem** (the marks that live
inside a row: the rail's toggle, a conversation row's menu button, a row's own actions). Everything
with a body is one of these two, centred, so a control's
height never moves when its words do; a row of decisions is one row of one height and the
primary is shouted with colour, never with size.

**The window is two columns: the rail and the page.** The **rail** is 16rem wide and
**collapses completely** — no icon strip, the page takes the whole width — with the toggle in
the view head and on a keyboard shortcut; the state is remembered. Its content, top to bottom:
the places (New conversation, Search, Tasks), then **one collapsible section per folder** with
its conversations flat beneath — name at the left, mono meta right-aligned at the row's end, no
dot leaders and no two-level tree — then Settings at its foot. A folder with nothing under it is
a heading, not a control.

**A phone shows one column at a time.** A desktop window stops at 1024 (`minWidth`); a browser has no
floor at all (ADR-0009), and a phone is 22–27rem wide — less than the rail's 16rem plus the page's own
floor, which is 236px where the window's three stand in the head, and less in a browser, which has
none. So below 30rem the two columns never share the page: it opens on the page, the toggle in the
head brings the column in **as the whole screen** — the same column, the same surface and the same
rows, without the hairline, because a hairline divides nothing when nothing stands beside it — and
what is chosen from it leaves it again, whether that is a conversation, a place or a settings panel.
Settings is this same rule with its own menu in that column, and one arrival is not a choice: entering
settings keeps the column, because the menu is what was asked for. The column carries the toggle in
its own masthead as well, since on a phone that banner is a head. Nothing floats over the page — no
drawer, no scrim, no overlay — so the page is never half-covered, and its frame never scrolls sideways
at any width (asserted by `e2e/design.spec.ts`).

**No band: the view head is embedded in the page.** The page's title and the rail's toggle stand
in one row at the top of the content area — there is no separate 3rem strip between the window
and the page. What is done *to* a conversation — rename, archive, export, delete — lives on the
conversation's own row in the rail, never in the head. **The window's own three** — minimize,
maximize, close — are
locked to the *window's* top-right corner and keep the same x and the same y on every page of
the app; a page that grows a row does not drag them down with it (asserted by
`e2e/design.spec.ts`). The whole top edge is the drag region; its interactive children wear
`no-drag`. A browser draws no window of ours, and macOS draws its own controls.

**One template for every page:** rail + embedded view head + content area. The conversation, the
tasks list and the settings panel are the same skeleton with different content. **Settings
replaces the rail** — it is a place, so its own navigation takes the same column at the same
width, and the way back lives at its top. The tasks page has no return row of its own: the rail
beside it *is* the way back.

**The composer is docked at the foot of a conversation** — an inset card on the page's own edges,
growing with what is written into it (`field-sizing-content`, up to its cap), carrying the attach
control, the level chip, the model chip and the thinking-effort knob in one foot row with send at
the right. One row wherever a window can be (its floor is 1024); in a browser narrow enough that the
five do not fit — a phone — the row wraps into two lines, the attach control and the level chip on
the first and the model, the knob and send on the second. It wraps rather than squeezing: a control
that gives way under its own text is drawn over its neighbour. What may give is the model chip's
name, which ellipsises inside its own ceiling; the level chip's name does not, because C5.7 pairs it
with the colour, and the knob keeps the words of the effort it stands for. The knob stands at the
model chip's right hand: the effort is a decision about the
model's room, so it is chosen where the model is. While a run is live
its top edge lights `--accent`: the margin is lit where the turn is being written. Queue,
attachments and approval keep their existing behaviour — this is skin, not plumbing.

**A new conversation is a welcome.** Before its first question the page holds a composition in
the middle of the room: the workbench's name faint above (decoration, hidden from a reader), a greeting
in the largest text voice — the hour decides which — the writing box standing there rather than
at the foot, the folder the message will be written in said on the box's own top edge with its
address on the tooltip, and starter chips under it that lay their words in the box. With no
folder at all there is no welcome: the foot keeps the box, saying a folder comes first.

**Where a hairline goes**: between two *different kinds* of thing — the view head from the body,
the rail from the page, one settings group from the next. Two of the same thing repeating get
space and a surface step, never a rule. The rhythm between groups is drawn by the container that
holds them (`PANEL_GROUPS`: a hairline and 1.25rem above each group but the first), so a group
cannot forget it. **Scrolling bodies reserve the wheel's room** (`scrollbar-gutter: stable`)
and what stands beside one gives up the same room, so nothing moves sideways when content
passes the fold.

**What the window spends is said once**: the turn's total cost is a tooltip on the view head's
session title — the transcript carries no per-turn tail lines, and single-message cost is not
shown at all. That tooltip leads with the name the head is showing, because a head truncates in a
pane narrow enough and the name is the one the window is open on: one tooltip, both facts, the name
first. What it repeats is the name the ledger keeps — the message's first line at `TITLE_LIMIT` —
so it names the document rather than quoting more of the message than was ever stored.

## C5.5 — The distinctive pieces

Six elements carry the identity. They must be recognisable from a screenshot with the text
removed:

1. **Four near-neutral steps.** Surfaces two to three percent apart in lightness, hierarchy
   built from steps and space, hairlines only where kinds meet. This is the thing that says
   "quiet instrument" before a word is read.
2. **The indigo signal.** One saturated hue at exactly four jobs: the streaming caret block, the
   current row's margin bar, solid primary buttons, the focus ring. Everything else is grey
   on grey.
3. **Two voices.** Sans for what is read, mono for what is operated — a sans name beside a
   right-aligned mono meta in every list row, a mono word in a rounded box on every button.
4. **The rail.** 16rem of collapsible sections: places, folders-with-flat-rows, Settings — flat
   rows carrying mono meta at their right end, joined by nothing.
5. **The embedded view head.** Title in the content's own top row, the window's three locked to
   the window corner, no strip between window and page.
6. **The approval card.** A pending approval is an inline card in the transcript — `--surface-2`,
   rounded-xl, `--line-subtle`, a `medium` shadow, an amber mark while it waits — with the
   command in a copyable mono well and three same-height (2rem) decisions: Allow once, Always
   allow (with its scope), Deny (with its reason). The structure the gate locked is kept; the
   printed docket is not.

## C5.6 — Motion

Three durations, one curve: **100 / 160 / 250ms** on `cubic-bezier(.25, .46, .45, .94)`
(ease-out-quad). 160ms is the default for colour transitions, entries and state changes; 100ms
for the quick feedback; 250ms is held for a panel or dialog arriving, and the one arrival the
window has today — a menu's quarter-rem rise — takes the normal 160ms instead, because a person
clicking twice should never wait for it. Pressing adds nothing of its own —
the same colour change the pointer already got is the whole answer, and no control scales or moves.
On hover, only colour, border and ink change — nothing
moves, nothing scales, no box changes: the pointer's answer is one gesture everywhere (a row
fills `--surface-2`, a row inside a floating layer tints with the line, an outlined button
tints, a solid one deepens, a chip strengthens its frame), and it is the only gesture. At rest the
animations are the pulse and the same pulse in a semantic colour: the streaming caret and a working
conversation's mark in `--accent`, and an approval waiting on a person in `--warning`.
`prefers-reduced-motion: reduce` collapses every
transition to 0ms and freezes the caret and the mark.

## C5.7 — Accessibility floor

Keyboard reachable: every control, including the approval's decisions, with a visible
**`--accent` focus ring, 0.125rem wide, offset 0.125rem** (scaling with the root), never
removed —
`:focus-visible` draws it for the whole app, so `focus:outline-none` is not a class this app
writes (`05-design:no-focus-outline-none`) — **one exception: the composer's writing field**,
where the caret is the focus answer and the ring would frame a second box inside the card that
already frames it; its `focus:outline-none` line carries a `constraints-ignore` marker and
nothing else may. A field may also change its border when focused;
that is in addition to the ring. The approval card takes focus on Allow once when it appears and
Tab cycles its decisions; **Escape never decides** — it only moves focus away, because denial is
an act, not a dismissal. Colour is never the only carrier of meaning: each level chip pairs its
colour with its name, each tool status pairs its colour with a glyph, the row you are in pairs
its margin bar with `aria-current`, and a menu marks what is in force with a filled row, an
accent check and `aria-checked`. Decoration is hidden from a reader: a rule drawn as an empty
`span`, and an icon that only decorates, are `aria-hidden`.

## C5.8 — Copy

Sentence case for everything except proper nouns — and no typography that shouts instead of
saying: labels are sentence case by rule (`05-design:no-uppercase-labels`). Buttons say what
they do ("Allow once", not "OK"). Empty states explain the next action in one sentence and offer
it as a button. Errors say what failed, where, and what to do next; they never apologise and
never blame the user. Interface copy lives in the dictionary (`ADR-0010`) and is *stored* in
sentence case; `05-design:copy-has-a-key` keeps it there.
