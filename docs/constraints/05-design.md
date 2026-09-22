# 05 — Design

Alpha must look like a tool someone works in for six hours, not like a landing page. The
visual language is called **Iris**: cool porcelain surfaces, graphite ink, and a single electric
indigo accent that is the only saturated colour in a resting window.

## C5.1 — Why cool

Warmth was this app's first idea; it read as beige the moment a screenshot met a wall of model
prose, and every warm neutral had to fight the copper accent for the same three percent of hue.
Iris is the opposite bet: the neutrals are porcelain and graphite — two percent of blue, never
enough to feel cold — and *all* of the hue in the window belongs to the accent, so the signal is
louder precisely because the room is quieter. The dark palette is the same discipline with the
lamps off: blue-black rooms where the accent is the only light source.

The coolness lives in the **surfaces themselves**. The light palette is porcelain — a clean white
page, pearl chrome, and a window of cool air behind both — and the hairlines are the colour of a
scored edge. The shadows carry the same cast: a shadow here is never pure black, it is ink with a
drop of blue in it.

## C5.2 — Tokens

These are the only colours in the app. Components reference tokens, never raw hex.

**Light is the default theme.** The window is painted before any state is read, so the palette in
`@theme` is the light one and the dark palette is the override. `prefers-color-scheme` is resolved
in the renderer, not in the stylesheet: `system` is a *choice* between two palettes rather than a
third palette, and resolving it once keeps the stylesheet to plain selectors.

| Token | Light (default) | Dark | Use |
| --- | --- | --- | --- |
| `--ink-900` | `#ECEEF3` | `#0C0E13` | The window behind the panels, and the deepest insets (a code well, a diff) |
| `--ink-800` | `#F4F5F9` | `#12151C` | Chrome: the rail, a settings panel's band, a grouped block, the composer's glass |
| `--surface-overlay` | a tint of `--parchment` over `--ink-800` | the same, mixed in the dark palette | A menu and the command palette: the step the ladder's overlay is drawn on |
| `--ink-700` | `#FFFFFF` | `#181B23` | The page: the transcript, a settings panel, a task list, anything typed into |
| `--ink-600` | `#E5E8EF` | `#222633` | Hover, and the selected row |
| `--line` | `#E3E5EC` | `#262B38` | Hairline borders — a scored edge, not a grey divider |
| `--line-strong` | `#C9CDD9` | `#3B4254` | Focused input border, a resting status dot |
| `--parchment` | `#181A21` | `#ECEEF3` | Primary text |
| `--parchment-dim` | `#4D5262` | `#A3A8BA` | Secondary text, labels |
| `--parchment-faint` | `#767D8E` | `#6F7889` | Metadata, timestamps |
| `--warm` | `#C2410C` | `#FB923C` | The `full-access` level, and nothing else |
| `--jade` | `#047857` | `#34D399` | Success, connected, auto-approved |
| `--amber` | `#B45309` | `#FBBF24` | Waiting on the user, warnings |
| `--danger` | `#C52222` | `#F87171` | Denied, failed, destructive |
| `--info` | `#2563EB` | `#60A5FA` | Neutral system notices |

The page is the lightest step in both palettes and the rail and the bands are the step away from
it, so the window reads as a page with chrome around it. **The accent is the only colour in the
chrome** — everything else is the porcelain scale above plus the four semantic tokens.

### The surface ladder

A surface is placed, never picked, and the placement alternates as it nests:

1. **The window** is `--ink-900`, and it is seen as the gutter all the way round the two panels
   that sit in it — a half-rem of it, which is also the offset a floating overlay uses.
2. **The page** is `--ink-700`: a conversation, the tasks list, the settings panel, anything the
   reader reads as a document and anything they type into. It is a rounded panel with a hairline
   and `--shadow-card`, floating in the window beside the rail.
3. **Chrome** is `--ink-800` — the rail (a rounded panel of its own), a settings page's band, and
   a block that *groups* rows inside a settings panel. This is why the step exists twice: the
   second grey is not the window behind the page, it is the page's own furniture.
4. **An inset inside that** alternates once more: a code well or a diff is `--ink-900`, an
   expanded tool body `--ink-900/60`, a thinking block `--ink-800/60`. Half-alpha rather than a
   fourth token, so an inset is a tint of the surface it sits on in either palette.

**An overlay is a lift, not a coat of chrome.** A menu, the command palette and a row's own menu are
drawn on the page or on the rail, and they have to stand a readable step off whichever it covers:
`--surface-overlay` is that step — a tint of the ink over the chrome (`color-mix(in oklab, …)`, so it
follows the palette) rather than chrome itself, which in the dark palette sits two percent off the
scrimmed page and leaves a panel that is not there. The rows *inside* an overlay are the same idea
one level down: a tint of the ink the panel is made of (`--parchment` at alpha), never a solid step of
the ladder and never a grey. `e2e/surface.spec.ts` composites what the panel is drawn on —
scrim included — in a canvas and requires a contrast of at least 1.1, in both palettes, for all four
overlays; it also measures the rows: the one in force, and the one under the pointer, must each stand
further off the page than the overlay around them.

The alternation is what answers "how deep am I" without a border telling the reader: porcelain, white,
porcelain, tinted. Every step is measured against whatever text sits on it by
`tools/design/theme.test.ts`, which reads the tokens out of the stylesheet. A surface never
blends a colour of its own: these four steps, the overlay's tint and the scrim behind it are the whole
vocabulary.

### The accent is a slot, not a colour

`--accent`, `--accent-bright` and `--accent-ink` are the primary accent: the streaming answer, the
focus ring, the primary action, the row you are in. `data-accent` on the document picks the palette,
and each one defines all three for both modes — an accent that is only legible on one palette is not
shipped.

| Accent | Light | Dark | Named for |
| --- | --- | --- | --- |
| `iris` (default) | `#4F46E5` | `#8A90FF` | electric indigo — the signal the app is lit by |
| `ember` | `#A8481A` | `#E2762F` | burnt orange, kept for its warmth |
| `sage` | `#5C7220` | `#A8BF5C` | olive, clear of `jade` |
| `rose` | `#A83A63` | `#E989AE` | pink enough not to read as `danger` |
| `plum` | `#7241A8` | `#B98AE0` | the red side of violet, where iris is the blue side |

The four level colours — `info`, `amber`, `jade`, `warm` — are fixed and are **not** the user's
accent: a green accent would otherwise paint `accept-edits` and `full-access` the same colour.

| Level | Token |
| --- | --- |
| `plan` | `--info` |
| `ask` | `--amber` |
| `accept-edits` | `--jade` |
| `full-access` | `--warm` |

Every text/background pair above must clear **4.5:1** — including every accent against every surface
in both modes, and `--accent-ink` against its own accent. `--parchment-faint` is metadata only and
still clears 3:1. Contrast is asserted numerically in a test, not eyeballed.

## C5.3 — Type

Sizes are written as **rem** (0.0625rem = 1px at the default root): the four roles without a
Tailwind built-in are named tokens declared in `app.css`'s `@theme`, and the rest use Tailwind's
own scale.

| Role | Family | Token | Size / line-height | Weight |
| --- | --- | --- | --- | --- |
| Body, message text | Inter | `text-body` | 0.9375rem / 1.65 | regular |
| Markdown headings inside a message | Inter | `text-lg`, `text-base`, `text-body` | 1.125, 1, 0.9375rem / 1.4 | semibold |
| The name of a thing: a provider, a sidebar row, a task, a chip, the word on a control | Inter | `text-ui` | 0.8125rem / 1.4 | medium |
| Prose in the interface: an empty state, the sentence under a control | Inter | `text-ui` | 0.8125rem / 1.4 | regular |
| Metadata, chips | Inter | `text-xs` | 0.75rem / 1.3 | regular |
| Actions that are words: Copy, Rename, Export, Delete | Inter | `text-xs` | 0.75rem / 1.3 | regular (the one primary action on a surface: medium) |
| Code, tool output, diffs, inline code | JetBrains Mono | `text-code` | 0.78125rem / 1.55 | regular |
| Mono metadata: paths, counts, editable fields | JetBrains Mono | `text-xs` | 0.75rem / 1.3 | regular |
| Micro-labels: block markers, status words, shortcuts | JetBrains Mono | `text-micro` | 0.6875rem / 1.3, uppercase | regular |

**Three weights exist, and only three.** `font-medium` marks *the name of a thing* and *the word
on a control*; `font-semibold` marks a *heading* — a page's title in
its band, a screen's own name, and a heading the model wrote — always with `tracking-tight`,
because a larger grotesque set at its default tracking looks loose where print looks composed.
Regular does
everything else. Nothing is bold, extrabold, black, light or thin: hierarchy comes from size,
colour and space, and a fourth weight would be a way of shouting what the layout should have said.
`05-design:no-other-weights` fails `pnpm check` on `font-bold`, `font-extrabold`, `font-black`,
`font-light` or `font-thin` anywhere under `apps/desktop/src/renderer/`.

| The display voice: a page's title in its band, the name a screen with no page gives itself, the title page | Inter | `font-display` `text-xl`–`text-3xl` | 1.25–1.875rem / 1.4 | semibold (the sentence under the title page: regular, no tracking) |

The **display voice** and the sans voice are the same family by design: the distinction between
what a page *is* and what the interface *says* is carried by size, weight and tracking, not by a
second face — a serif quoted the person's words in the previous language, and it read as a costume.
The **mono voice** (JetBrains Mono) *measures*: paths, counts, tokens, durations, shortcuts,
identifiers, code — and the tool call a turn made, whose summary line is a sentence of
measurement: glyph, name, what it touched, how it went, how long. A question in the transcript is
sans, in the answer's own size and weight — the bubble that holds it is what sets it apart, not a
different voice; the measurements around both are mono.
An action is set in sans wherever it
appears, and mono inside a button is data the button is carrying (the shortcut it answers to), not
the button's own voice. `05-design:control-voice` fails `pnpm check` on a `<button>` whose own
class says `font-mono`. A sidebar row is the place the rule is easiest to get wrong: it is a list
of names, so it is sans, and the counts and ages beside those names are the measurement that stays
mono.

The token carries the leading for its role; a paragraph of UI text that wraps anyway (empty
states, the sentence under a control) may add `leading-relaxed` on top of it.

**Width.** **A page fills the pane the rail leaves it, one padding in, and everything the page holds
stands on that one pair of edges.** The prose of an answer, the code and the tables inside it, the
tool lines, the reader's bubble at the right end, the bar the next message is written in, a form's
fields and cards — all of it is written on the page's own edges, and the window's width is the room
the page uses. Nothing stands on a second, narrower edge, and nothing is placed by the window's
centreline.

That is the end of a short history, each step of which was an overcorrection of the last. The first
window spread one conversation across two thousand pixels with no width of its own, which is a page
that lost its column, not a wide one. The fix was a capped column — the reading measure for the
conversation, 56rem for the forms — and the cap turned every wide window into an island, with dead
space at its sides. The island was centred, the way the chat clients draw one, and the centring moved
the sentence the reader was reading every time the window changed width: the answer started 244px
right of the page's own title at fourteen hundred pixels and 724px right of it at twenty-four
hundred, while the rail and the band beside it never moved. The island was then stood on the page's
own edge, which only moved the dead space to the right. What was being asked for, all along, was the
page itself: use the room, and never move.

What still keeps a width of its own is a **sentence of the interface** — a panel's note, a hint under
a field, an empty state's line: `max-w-measure`, the reading measure, on the lines that are labels
rather than content. An answer's own prose fills the page, because that is the room the reader asked
the window for. `e2e/design.spec.ts` measures a page at two window widths and refuses any x that
moves between them, measures the conversation's parts on one pair of edges at 2400 wide, and sweeps
every interface sentence for the measure it still keeps.

## C5.4 — Space and shape

A 0.25rem base scale, used as `1, 2, 3, 4, 6, 8, 12` (Tailwind's `p-1`…`p-12`). Borders are 1px
hairlines. **Nothing is square (ADR-0017), and the corners are crisper than they were**: 
`--radius-control` `0.5rem` for a button, a chip, a field, a row; `--radius-card` `0.75rem` for a
panel, the page, a block in it, the composer's bar; `--radius-overlay` `1rem` for a menu and the
command palette. Chips and state dots are pills (`rounded-full`). There are three radii and no
fourth: a component that wants a different corner wants a different element. A control with a fill
or an edge is never given a zero radius — the composer's send control, the window's own buttons and
the head's selects included.

**Everything with a body is one height.** A button, a chip, a field and a select that stand in a row
are `CONTROL_HEIGHT` (1.75rem), and what is inside them is centred in it rather than given its own
padding, so a control's height does not move when its words do. A row of decisions is one row: the
gate's Allow once, Always allow, its reason field and Deny are the same height, and the primary is
shouted with colour rather than with size — a button taller than the decision beside it is a button
out of place. A row *inside* a composite control (the scope select beside "Always allow") is that
control's inner box, not a second height. `e2e/design.spec.ts` measures the composer's foot, the
strip's commands and the gate's decisions.

**Height comes from three shadows, edges come from hairlines.** `--shadow-card` lifts the page and
the rail off the window; `--shadow-soft` lifts what floats a little less — the composer's bar, the
gate; `--shadow-overlay` is for the only things that leave the page entirely — a menu, the command
palette — and it is the one that has to read against whatever is under it. All three are low-alpha
and wide, cast in ink with a drop of blue in it: a menu casting a black halo is the thing that makes
a soft interface look cheap in one screenshot. The dark palette carries the stronger set, because a
dark page swallows the first of them. A shadow is never drawn where a hairline would have done, and
nothing has both a heavy border and a shadow.

**The window has a gutter, and two panels sit in it.** A half-rem all the way round, on
`--ink-900`. The **spine** is a rounded panel: the window's one banner is its head — the mark and
and the whole head a drag handle — and under it live the places one can
go (a new conversation, search, tasks, each a row at the control height with its shortcut in the
measuring voice), the index of folders and conversations, and settings pinned at the foot under its
own hairline. There is no strip across the top of the window: a second row of chrome spent height
the page reads on, and its commands live just as well in the spine. The page — the conversation, the
tasks list, the settings panel — is a rounded panel beside the spine with a hairline and
`--shadow-card`, taking everything beside it at the full height of the window. Nothing is full bleed
except the window itself.

**Settings swaps the rail, it does not nest inside the page.** The menu is the same panel in the
same slot at the same width as the rail, because the two screens are the same window twice; a menu
drawn *inside* the page would give the window a third surface it does not have, and the two screens
would disagree about where the left column ends. A page's own way back lives in that panel, not in
the page.

**A page wears a band.** One height (3.5rem, the spine head's own height, so the two hairlines
under them read as one line across the window), one padding (`BESIDE_SCROLLS` — the page's own padding
plus the room the wheel takes, since the band never scrolls and has to end where the body ends), a
hairline under it, and the
page's title in it at the left — so the title stands on the same x on the conversation, on the tasks
list and on every settings panel, and the panel's own sentence is the first line of the body rather
than a second line in the band. The body starts one distance under that rule on every page whose body begins
below it (1.5rem), because a page whose first line sits four pixels higher than another page's is a
page assembled apart from it. The conversation is the exception the glass explains: its transcript
slides *under* the head, so what it needs is that no entry comes to rest beneath it, not an offset.
The head's glass is **the page's own colour, blurred** (`--ink-700` at eighty percent) — the
transcript passes under a pane of itself, not under a shelf of chrome; the settings band, whose
body never slides under it, is solid chrome instead. The band is a **drag region** — with the
spine's head, it is how a frameless window is moved — and its interactive children wear `no-drag`.
What acts on the page itself (adding a task) sits at the band's
right end; what acts on something in the page stays with that thing. And past a last rule, at the
very end of the band, sit **the window's own three** — minimize, maximize, close — because they act
on the window and not on the page, and the window's corner is the top right. They are the rightmost
thing on every page and the one x they share is the corner itself; every screen without a band —
the workbench before a folder is chosen, and a folder's title page before its first question —
carries them in a corner of its own, so a frameless window is closable from wherever it is. A browser draws no window of ours, and macOS draws
its own controls, so there they are drawn nowhere at all. A page's way back is the one
row that may stand above its band — the tasks page carries one there, and settings carries its own
in the menu instead, where the row belongs to the panel rather than to the page.

**A page's band says what the page is.** The title, and what acts on the page at its right end —
never a repeat of what the row in the rail beside it already says. The title takes the room that is
left, keeps a floor of its own and truncates past it, so anything else the band carries is room taken
from the one thing it exists to say.

**A band is chrome, and chrome does not move.** The band is written on the page's own padding on every
page — the conversation, the tasks, every settings panel — so the title stands on one x wherever you
are, and on that same x after the window has been made wider or narrower. It is *not* written on the
page's edges: a head that slid inward with the content would move every time the window changed size
while the rail beside it stayed where it was. What acts on the page ends at the band's own right end,
which is the page's padding plus the wheel's room and the same x on every page.

**One page, one content edge.** A page fills the pane, and nothing in it is drawn on a second edge:
what acts on something in the page stays with that thing. A page's title and body start on the
page's own padding, and its prose, code, tables, tool lines, bubble and composer end on the page's
own right edge — a page whose title and body disagreed about their edge would be two pages of one
window assembled by two people. `e2e/design.spec.ts` measures it — the pages' titles and bodies agree
on their left edge at two window widths, the conversation's parts agree on their edges, and the
band's right end is one x on all three kinds of page.

**The wheel's room is part of that edge.** A page is a body that scrolls, and a scrollbar takes its
room out of the body it scrolls — so a body that scrolls reserves it always (`SCROLLS`, the
`scrollbar-gutter` on the transcript, a page body, the rail, and the two lists that open as menus and
can grow while they are open), or every row in the list moves 8px sideways the moment the content
passes the fold, which is the moment a person is reading it.
What stands *beside* a scrolling body and never scrolls itself — the band of a form page, the way
back above the tasks — loses nothing to a wheel, and gives up the same 0.5rem on purpose
(`BESIDE_SCROLLS`), or the band's right end would land 8px past the edge the body's own scroll box
ends on. A conversation spends none of that: its band is inside its one scroll, so it shares the
wheel's room with the rows rather than standing beside them — and it needs no more than the page's
padding, because the wheel's room is already outside the box it is drawn in. The two routes land on
one x, and `e2e/design.spec.ts` measures the band's right end on all three kinds of page, at two
window heights, one where the transcript fits and one where it scrolls. The wheel itself is half a rem of room with a
grip of half that inside it: the transparent border that keeps the thumb a pill must leave a hand
something to take hold of, so it is an eighth of a rem a side and not more. `e2e/design.spec.ts`
measures the three edges of a page at two window heights, one where the transcript fits and one where
it scrolls; `e2e/surface.spec.ts` measures the grip inside the bar.

**The transcript reads as a conversation, not as a document.** The reader's message is a **bubble**
— the page's own surface lifted one step and framed, set to the page's right edge, capped near the
measure so a short message stays a bubble, rounded square but for the corner that faces the answer,
which is drawn small — because
what the reader typed is theirs, and the bubble is what separates it from the work below without a
rule. Nothing in it is lit; the accent is the workbench's, not the reader's. The work the
workbench answers with starts on the column itself, **full width and unboxed** — thinking, tool
calls, the answer — with no badge beside it and no numbered margin down the page: the voice that
answered owns the column, and the reader's words are the visitors in it.

**A turn ends with a line.** The last answer of a turn is closed by a hairline the width of the page
with what the turn spent at its right end — mono, faint, one line. It is the one
rule in the app that carries text, and it is what lets a long conversation be read as turns rather
than as one run of prose; the running total stays in the page's head, where it belongs to the
conversation.

**The page is one scroll, and the bar is docked in it.** The band that names a conversation and the
bar the next message is written in are both inside the page's own scroll: the band is pinned to its
top and scrolls away with the page, the bar is stuck to its foot and comes to rest after the last
row. Nothing is spent on a strip at each end for chrome that never moves, the transcript passes
behind both, and what the rows fade into at the foot is the bar's own page colour rather than a pane
of glass over them. The composer's shell takes no pointer at all, so a wheel over the air beside the
bar still scrolls the page the way a hand expects.

**The composer is a bar on the page's own edge.** A rounded bar at the foot of the page, standing
where every answer stands — its left and right edges the same ones the transcript is written on — so
what is being written and what has been written share one pair of edges. It grows with what is written into
it (`field-sizing-content`, from a single line up to its cap) rather than being a
fixed box, and it explains nothing about itself: there is no line under the words saying what the
box can do, because the control that decides it — the model, the level, the attach button — is
already in the row below. The one thing that can appear under them is a refusal no control could
have said (an `AttachmentNote`: a picture the model cannot take, or one past the size limit).
Everything the message carries or is allowed to do sits in one row under the words, aligned to
their foot so a growing message does not move the controls under the hand: the way in to the file
picker and the level chip at the left, the model it will run on and the control that sends it at the
right. The left cluster is the one that gives way when the row is tight — it may be scrolled out of
sight inside itself — and the right one is never cut, so the control that sends a message is always
where it was. Both chips
follow one rule — with a conversation open they change that conversation, and with none open they
change what the next one starts with — and neither is duplicated in the head, because a setting
lives where the message that uses it is
written. When the bar is listening — focused — its hairline takes the accent; while the agent
works, the bar carries the glow, because that is where the turn is being written.

**What the box holds, the box bounds.** The composer may not grow past the page it stands on: the
transcript gives up its room to it, so a box that kept growing would push the words — and the
controls that send them — off the bottom of the window. The draft stops at its own cap (10rem), and
the two things that arrive in numbers — the waiting messages and the pictures — scroll inside a 15vh
strip and a 10vh row of their own, because a queue or a pile is bounded by how much there is, not by
how tall the window is. The paused notice and its Resume stay outside that strip: a control that can
be scrolled out of reach is not a control. With the foot, the notice and the paddings, the composer
stays inside the page on any window taller than about 31rem; a browser window shorter than that is
smaller than the workbench, not a layout to design for (ADR-0009). What has to be visible at all
times is the last line of the page: the controls, and the line being typed.

**Where a rule goes.** A hairline separates two *different kinds* of thing: the page's head from its
body, the transcript from the composer's bar, **the rail's one starting action from the two that go
somewhere, and those from the index below them**, one folder group from the next, one section of the
settings panel from the next. Two of the same thing
repeating get space and nothing else — no rule between two conversation rows, which are set apart
by their own hover and by the lit row the current one is. Two repetitions *are* ruled, and both
are logs read line by line: the ledger of tool calls, and the events inside an expanded row (C5.5).
An entry's rule is the one exception that is not a separation: it closes what the reader asked, and
the work hangs under it. A rule is `--line`, one step lighter than the text around it, and never a
shadow.

**Glass, and light.** Two materials complete the depth system, and both are earned by being used
exactly where they are the only honest answer (ADR-0020). **Glass** — `backdrop-blur` under a
translucent fill of the surface it floats over — is for the two surfaces the page slides beneath: the
head (the page's own colour, blurred) and the composer's bar (chrome, blurred). **Light** is the
glow: the accent casting its own light on what is lit by it — the primary button, the app's mark, the
cursor, the hearth at the foot of the page that brightens while the agent works and settles when it
is done. Nothing else blurs, nothing else glows, and depth is still, first and last, a change of
surface. The one gradient in the app is the mark and the primary action sharing: the signal running
into its deeper edge — the same light on the one thing that starts everything and the one thing that
sends everything.

**A form is a panel of groups.** The fields of one concern stand together, the groups are separated
by hairlines, and the form ends the way the gate ends: a rule, then the actions at the right end,
primary last.

**The rhythm between groups is drawn by the container that holds them** (`PANEL_GROUPS`: a hairline
and 1.25rem above each group but the first), and it reaches every level of grouping — the container
that holds a panel's sections, and the container that holds a panel's own groups. A group that carries
its own margin instead is a group that will one day forget it, and the failure is not subtle: the
keychain notice sat with its last line on the sentence of the block beneath it, because its 0.5rem
margin pointed up and nothing pointed down. The rhythm is also the *only* thing that separates two
groups — a panel whose groups are 0, 8, 16 and 37px apart is a panel assembled in four sittings.
`e2e/design.spec.ts` measures it on all five panels: a rule between every two groups, no group
bringing a margin of its own, no two groups' text within a rule of each other, and the first group of
every panel the same distance under the panel's own sentence.

**A block that groups fields is inset by one number.** A panel's grouping blocks — the card around a
provider, the card around a model, the form that adds one — are inset 1rem on all four sides, and a
block nested inside one is inset half that. The inset is the same in every panel, because two
grouping blocks a few pixels apart is a panel that looks assembled by two people.

**A notice is a line, not a block.** It wears the control radius rather than the card's, and its
own padding: half a rem above and below, three quarters of a rem at either end. The keychain notice, the
level note, the transcript's failure line and the composer's paused line all wear that shape —
`rounded-control` with `px-3 py-2` — and the first of them is the one `e2e/design.spec.ts` measures,
the others being the same shape by construction.

**A field the person writes a message in is a field they write several lines in.** The task prompt
is the body voice at three rows — never a control-height box with its own text scrolled out of
sight.

`e2e/design.spec.ts` measures the insets, the nested one, a notice's shape and padding, and the
prompt field's three rows. A field's own label sits above it in `text-xs`, and the line that explains it is
`text-micro`, faint, with room to wrap. A section's name is set in the mono micro upper case the
column labels use — the same voice that says `Folders` and `Gate`, tracking and all — because a form's
groups and a record's fields are the same kind of thing: parts of one thing, named. One token says it,
`GROUP_LABEL`, in the control vocabulary, and every one of those places wears it, so the voice cannot
be retyped with a narrower tracking. A screen's own name is the other end of the same rule:
the display voice, wherever the name is set. `e2e/design.spec.ts` measures both — every settings
panel's parts in one voice, every page's title in the other — and the table above keeps one row per
thing, because a second row for the page title is how three panels came to name their sections in a
third voice.

**The rail's indent.** A row of the rail — a place one can go, a folder, a conversation, a task, the
door to settings — has one shape (`RAIL_ROW`: 0.5rem of padding and one gap between a glyph and the
name it belongs to), so every name in the rail stands on one x and no row holds its name two pixels
from the next one's.

The rail is a tree, and the tree is read in one x per level: what a row *holds* is indented one step
past it (`RAIL_STEP`, 1.25rem), the step is the same at every level, and the *list* adds it rather
than the row asking for it — which is why the step cannot drift apart between the conversations under
a folder, the tasks beside them and the runs under a task. A task runs *in* a folder and is held by
it, so it stands one step in from the folder rather than on the folder's own x, where it reads as
another folder and leaves the runs under it with no level of their own to stand on. The conversation
you are in is a **lit row** — a solid whisper of the accent blended onto the chrome, with a spine of it
at the row's left edge — and no shadow pretends the rail has shelves. A row that puts a name anywhere
else is the thing that makes a rail look hand-assembled, and so is a rail whose door to settings is
carried eight pixels in from every other row by padding the panel already had.

**A folder with nothing under it is a heading.** Its row names the folder and says there is nothing
in it; it is not a button, it has no `aria-expanded`, and clicking it folds nothing, because there is
nothing to fold. A row that offers a fold over an empty section is a control that does nothing.

**The spine's groups, and the one action that is a glyph.** The spine reads top to bottom as four
kinds of row, and the hairlines between them are the only thing that says which is which: the head
(the mark), then the **places** — the one row that *starts* something (a
new conversation) and the rows that *go* somewhere (search, tasks), each at the control height with
its keyboard shortcut at the right end in the measuring voice — then a hairline, then the **index**
with its own heading row, then a hairline and the **door** (settings) pinned at the foot. A rail
whose actions run together is a rail where the fourth row means nothing. A control that acts on the
index itself belongs *in* the index's heading row: adding a folder is a glyph at
the right end of `Folders`, beside its count, and never a row of its own. A row spent on it reads as
a fourth place to go, and it costs the spine a line of height to say something the `+` says in the
same box every other glyph action is drawn in.

**Lengths are rem, and the checker says so.** `05-design:no-px-lengths` fails `pnpm check` on any
px length inside `apps/desktop/src/renderer/`, with exactly one exception: `1px` hairlines, which have to
stay a device pixel to stay crisp.

## C5.5 — The distinctive pieces

Six elements carry the identity. They must be recognisable from a screenshot with the text
removed:

1. **The page and its conversation.** A rounded page floating in the window, a rail panel
   beside it, and one conversation column down the page: the reader's words in a bubble of the
   page's own surface set to the column's right edge — rounded square but for the one corner that
   faces the answer, drawn small so the bubble points at what came of it — and the work that
   answers them full width and unboxed on the column itself. This is the thing that says "a
   session with an agent" before a word is read.
2. **The tool line.** Every tool call is an inline summary in the answer's own column, not a card
   and not a ruled row: risk glyph, mono name, what it touched, who let it through, status,
   duration — one quiet sentence of measurement, whose arrow (the only affordance) is hidden
   until the pointer arrives and stays turned while the call is open. Opening one hangs the audit
   straight under the line, unboxed: arguments, the gate's note, output, diff, each under a mono
   micro heading.
3. **The mark.** A small rounded badge in the accent's gradient — the signal running into its
   deeper edge — with an `A` in it, followed by the app's name in mono upper case, at the head of
   the spine — the window's one banner. It is the only place the app signs the page, and the same mark signs the unlock
   screen and the screen that has no page yet.
4. **The gate.** A pending approval is not a modal and not a card in the transcript's flow. It is
   a rounded block on the page's own surface with an amber spine down its left edge, holding the
   exact command in a recessed well, its working directory, and three decisions: Allow once, Always
   allow (with the scope it will be remembered for), Deny.
5. **The signal cursor.** Streaming text is followed by a 0.125rem accent block that pulses at
   1.2s and casts a little of its own light. It and a working conversation's breathing status dot
   are the only animations running in a resting window.
6. **The two chips at the foot of the composer.** The permission level is a coloured chip with a
   one-word label at the left of the foot, and the model is a quiet chip naming the model at the
   right: what the message about to be typed is allowed to do and what it will run on, both next to
   the message itself. The level chip is never hidden, including in `full-access`.



## C5.6 — Motion

150–220ms, `ease-out`, and only for: message arrival (6px rise, fade), tool row state change,
overlay entry, the ember cursor, and a working conversation's breathing dot. The one slow change is
the hearth — the light at the foot of the page — which fades over a full second when a turn starts
and settles over one when it ends, at the pace of a room, not of a control. On hover, only two
things change: colour and border — plus the one deliberate exception, a row's own actions fading in
over the row (`opacity`, and `focus-within` reveals them for the keyboard as well, so nothing is
hover-only). **The pointer's answer is one colour.** A row or a button the hand can act on fills
with `--ink-600`, on every surface and in both palettes: it is the one step off the page that reads
the same way twice — darker than the page in the light, lighter in the dark — where a wash of a
lighter token lifts over the rail in one palette and sinks into the page in the other, and where a
fill of the page's own colour says nothing at all. Four kinds of control answer in their own way
instead, and only these four: a **chip** brightens its own frame and keeps its fill, because the
fill is the level or the model it is named for; a row inside a **menu** takes a tint of the panel's
ink — a further step off the page than the menu itself, never back toward it; a control that is
already **lit or semantic** — the primary's accent, the destructive's red, the amber of a decision —
brightens its own colour, because that colour is what it means; and a **word** action fills nothing
at all and lifts its ink, so a row of actions under a message never turns into a row of buttons.
**Every control answers, and none is silent.** A hand that passes over something it can press is
told so — fill, frame, ink, or the light a lit thing brightens — and the outlined action comes in
three tinted siblings that each brighten their own colour: the accent for what the app offers to do
for you (`TINTED_ACTION`), the amber for a decision that is neither the primary nor a refusal, and
the danger for the one that destroys. `e2e/design.spec.ts` sweeps every button, link and disclosure
on every screen a window can reach and names the ones that say nothing: it found the agent panel's
`Install pi for me`, which offered to install the agent with an accent frame and no answer at all;
the gate's `Always allow`, whose hover was a no-op because its ink was already the colour it hovered
to; and a task card, whose whole body opens the task and answered only over its words. (The one
screen no window here can reach is the unlock card a *browser* is shown before it has a token; its
button wears the same shapes.) A control already in force is not asked, since it is saying "you are
here"; nor is a disabled one, nor a field, whose answer is the keyboard's ring. The row you are in
answers the same way everywhere: lit, not lifted — a solid whisper of the accent over the chrome
(`ROW_LIVE`), a spine of it at the left edge, on the rail and in the settings menu alike. Nothing
moves on hover:
`e2e/surface.spec.ts` hovers a chip, a rail row, a ledger row and an action and requires every one of
them to keep its box, its borders, its padding and its transform; it also requires each row and button
of the first kind to land on the one fill, in both palettes, and requires the rows inside a menu —
the one in force and the one under the pointer — to stand further off the page than the menu they
sit in.
`prefers-reduced-motion: reduce` collapses every transition to 0ms and freezes the cursor and the
breathing dot.

## C5.7 — Accessibility floor

Keyboard reachable: every control, including the approval buttons, with a visible 0.125rem accent focus
ring that is never removed — `:focus-visible` draws it for the whole app, and a control's own class
does not take it away, so `focus:outline-none` is not a class this app writes
(`05-design:no-focus-outline-none` fails `pnpm check` on one). A field may also change
its border when it is focused; that is in addition to the ring, never instead of it. The approval prompt takes focus when it appears and is operable with
`Enter` (allow once) and `Escape` (deny). Colour is never the only carrier of meaning: each level
chip pairs its colour with its name, each tool status pairs its colour with a glyph, and the row you
are in pairs its fill with `aria-current`. **A menu marks what is in force the same way everywhere**
— the row is filled and carries the accent check, while the state itself is `aria-checked` — so the
level menu and the model menu are read as the same control twice rather than as two controls that
happen to look similar. A mark that only a screen reader knows about is half a mark.

**Decoration is hidden from a reader.** A tool line's arrow is `aria-hidden`: it is the page's
furniture, and a reader being told "chevron right" after every call is being read a layout
instead of a transcript. The same goes for a rule drawn as an empty `span`.

## C5.8 — Copy

Sentence case for everything except proper nouns. Buttons say what they do ("Allow once", not
"OK"). Empty states explain the next action in one sentence and offer it as a button. Errors say
what failed, where, and what to do next; they never apologise and never blame the user.
