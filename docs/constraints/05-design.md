# 05 — Design

Alpha must look like a tool someone works in for six hours, not like a landing page. The
visual language is called **Ember Ink**: warm near-black surfaces, parchment text, and a single
copper accent that is the only saturated colour in a resting window.

## C5.1 — Why warm

Every agent app in this category is cold: slate, zinc, blue-black, and a violet accent. Warm ink
separates Alpha on sight, and it is not decoration: warmer hues at low luminance are easier to
sit in front of for a long session than pure black, and the copper accent reads as a working
lamp rather than a status LED.

The warmth lives in the **surfaces themselves**, not only in the accent. The light palette is
paper — an unbleached page, linen chrome, a warm white for what is being read — and the hairlines
are the colour of a pressed line. The dark palette is the same room with the lamp turned most of
the way down: warm near-blacks rather than an inversion of the light greys. The warmth is a
whisper, two to four percent off neutral, because paper that announces itself is beige, and beige
is the one thing this must not be. The shadows are warm too: a shadow on paper is never pure
black, it carries the ink's own brown.

## C5.2 — Tokens

These are the only colours in the app. Components reference tokens, never raw hex.

**Light is the default theme.** The window is painted before any state is read, so the palette in
`@theme` is the light one and the dark palette is the override. `prefers-color-scheme` is resolved
in the renderer, not in the stylesheet: `system` is a *choice* between two palettes rather than a
third palette, and resolving it once keeps the stylesheet to plain selectors.

| Token | Light (default) | Dark | Use |
| --- | --- | --- | --- |
| `--ink-900` | `#F6F4F0` | `#12100E` | The window behind the panels, and the insets that sit in the page |
| `--ink-800` | `#F0EDE6` | `#1A1713` | Chrome: the stamp strip, the rail, a page's head band, the composer's bar, a grouped block in a panel, overlays |
| `--ink-700` | `#FFFEFB` | `#211D18` | The page: the transcript, a settings panel, a task list, anything typed into |
| `--ink-600` | `#E9E4DA` | `#2B2620` | Hover, and the selected row |
| `--line` | `#E5E0D6` | `#363028` | Hairline borders — a pressed line, not a grey divider |
| `--line-strong` | `#C9C2B4` | `#4D453A` | Focused input border |
| `--parchment` | `#201B15` | `#F4F1EA` | Primary text |
| `--parchment-dim` | `#5C554A` | `#ACA394` | Secondary text, labels |
| `--parchment-faint` | `#7B7365` | `#857C6D` | Metadata, timestamps |
| `--warm` | `#A8481A` | `#E2762F` | The `full-access` level, and nothing else |
| `--jade` | `#1F6B4C` | `#56B394` | Success, connected, auto-approved |
| `--amber` | `#7A520E` | `#DFA947` | Waiting on the user, warnings |
| `--danger` | `#B02A25` | `#E46B64` | Denied, failed, destructive |
| `--info` | `#2F5399` | `#7B9ADA` | Neutral system notices |

The page is the lightest step in both palettes and the rail and the bands are the step away from
it, so the window reads as a page with chrome around it. **The accent is the only colour in the
chrome** — everything else is the paper scale above plus the four semantic tokens.

### The surface ladder

A surface is placed, never picked, and the placement alternates as it nests:

1. **The window** is `--ink-900`, and it is seen as the gutter all the way round the two panels
   that sit in it — a half-rem of it, which is also the offset a floating overlay uses.
2. **The page** is `--ink-700`: a conversation, the tasks list, the settings panel, anything the
   reader reads as a document and anything they type into. It is a rounded panel with a hairline
   and `--shadow-card`, floating in the window beside the rail.
3. **Chrome** is `--ink-800` — the rail (a rounded panel of its own), a page's head band, the
   composer's bar, an overlay, and a block that *groups* rows inside a settings panel. This is why
   the step exists twice: the second grey is not the window behind the page, it is the page's own
   furniture.
4. **An inset inside that** alternates once more: an expanded tool body is `--ink-900/60`, a
   thinking block `--ink-800/60`, a nested model row `--ink-800/60`. Half-alpha rather than a
   fourth token, so an inset is a tint of the surface it sits on in either palette.

The alternation is what answers "how deep am I" without a border telling the reader: linen, white,
linen, tinted. It also means one rule holds in both palettes — in light the sequence is
`#F0EDE6 → #FFFEFB → #F0EDE6`, in dark `#1A1713 → #211D18 → #1A1713` — and every step is measured by
the contrast test against whatever text sits on it. A surface never blends a colour of its own:
these four steps and the scrim behind an overlay (`--ink-900` at alpha) are the whole vocabulary.

### The accent is a slot, not a colour

`--accent`, `--accent-bright` and `--accent-ink` are the primary accent: the streaming answer, the
focus ring, the primary action. `data-accent` on the document picks the palette, and each one
defines all three for both modes — an accent that is only legible on one palette is not shipped.

| Accent | Light | Dark | Named for |
| --- | --- | --- | --- |
| `ember` (default) | `#A8481A` | `#E2762F` | the colour the app is named after |
| `sage` | `#5C7220` | `#A8BF5C` | olive, clear of `jade` |
| `iris` | `#4F46B0` | `#9A92EE` | blue-violet, clear of `info` |
| `rose` | `#A83A63` | `#E989AE` | pink enough not to read as `danger` |
| `plum` | `#7241A8` | `#B98AE0` | the purple side of violet |

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
| Page title, section title | IBM Plex Sans | `text-xl`, `text-lg` | 1.25, 1.125rem / 1.4 | semibold |
| Body, message text | IBM Plex Sans | `text-body` | 0.9375rem / 1.65 | regular |
| Markdown headings inside a message | IBM Plex Sans | `text-lg`, `text-base`, `text-body` | 1.125, 1, 0.9375rem / 1.4 | semibold |
| The name of a thing: a conversation's title in the header, a provider, a sidebar row, a field label | IBM Plex Sans | `text-ui` | 0.8125rem / 1.4 | medium |
| Prose in the interface: an empty state, the sentence under a control | IBM Plex Sans | `text-ui` | 0.8125rem / 1.4 | regular |
| Metadata, chips | IBM Plex Sans | `text-xs` | 0.75rem / 1.3 | regular |
| Actions that are words: Copy, Rename, Export, Delete | IBM Plex Sans | `text-xs` | 0.75rem / 1.3 | regular (the one primary action on a surface: medium) |
| Code, tool output, diffs, inline code | JetBrains Mono | `text-code` | 0.78125rem / 1.55 | regular |
| Mono metadata: paths, counts, editable fields | JetBrains Mono | `text-xs` | 0.75rem / 1.3 | regular |
| Micro-labels: block markers, status words, shortcuts | JetBrains Mono | `text-micro` | 0.6875rem / 1.3, uppercase, tracking wider | regular |

**Two weights exist, and only two.** `font-medium` marks *the name of a thing* and *the word on a
control*; `font-semibold` marks *titles* — the app's own name, a page's title, a heading. Nothing
here is bold, light or black: hierarchy comes from size, colour and space, and a third weight would
be a way of shouting what the layout should have said. `05-design:no-other-weights` fails
`pnpm check` on `font-bold`, `font-extrabold`, `font-black`, `font-light` or `font-thin` anywhere
under `apps/desktop/src/renderer/`.

| The display voice: a page's title, an entry's question, the title page | Newsreader | `font-display text-xl`–`text-3xl` | 1.125–1.875rem / 1.4–1.2 | medium (the sentence under it: regular, italic) |

**`text-ui` and `text-xs` are one pixel apart and are not interchangeable.** The boundary is the
two voices again: `text-ui` is what a thing *is* (a name, a label, a sentence in the interface);
`text-xs` is what a control *says*, and the metadata around it (a button's word, a hint, a chip). A
row's name is `text-ui`; the action at the end of that row is `text-xs`.

All three families are bundled with the app; there is no runtime font fetch.

**Chinese is not bundled: the machine's own face is named.** Neither bundled family has CJK
glyphs, so the sans stack names the three desktop systems' Chinese faces after `system-ui` —
`PingFang SC` (macOS), `Hiragino Sans GB`, `Noto Sans CJK SC` (Linux), `Microsoft YaHei`
(Windows) — and the mono stack names a CJK monospace before `monospace`. Naming them rather than
letting `sans-serif` decide is what makes a Chinese window drawn in a face someone chose, and
putting them after the bundled family is what keeps Latin characters in Chinese prose in IBM Plex.
A bundled subset was considered and skipped: it would only help a machine with no CJK font at all,
and it would have to be regenerated every time a line of copy changes. If a machine with no CJK
font becomes a real target, the upgrade is a `pyftsubset` pass over the dictionary's characters.
`tools/design/theme.test.ts` pins the stack.

**Three voices, never swapped, and each voice is someone.** The **display voice** (Newsreader, a serif cut for reading) speaks *for the person*: a page's title, an
entry's question, the title page, a section's name in the sentences that introduce a panel. The
**sans voice** (IBM Plex) speaks *for the workbench and the agent*: every control, every label,
every answer, every name. The **mono voice** (JetBrains Mono) *measures*: paths, counts, tokens,
durations, shortcuts, identifiers, code. So a question in the transcript is serif and the answer
under it is sans — the one voice is the person's, the other is the machine's — and the rule is
visible in every turn without being explained. An action is set in sans wherever it appears, and
mono inside a button is data the button is carrying (the shortcut it answers to), not the button's
own voice. `05-design:control-voice` fails `pnpm check` on a `<button>` whose own class says
`font-mono`. A sidebar row is the place the rule is easiest to get wrong: it is a list of names, so
it is sans, and the counts and ages beside those names are the measurement that stays mono.

The token carries the leading for its role; a paragraph of UI text that wraps anyway (empty
states, the sentence under a control) may add `leading-relaxed` on top of it.

**Width.** The page fills whatever the rail leaves, and the text block fills the page: tool rows,
diffs, tables and code blocks take its full width, because that is where long lines belong — a long
code line scrolls inside its own block rather than widening the page. Nothing parks a narrower page
in the middle of a wide window: a blank margin beside the words is worse than a long line, and the
room beside a centred column is empty either way. Prose is the one thing that reads worse the wider
it gets, so it keeps its 100-character cap (`max-w-measure`, declared as `--container-measure` in the
theme) on the assistant's markdown root and on an entry's own words. The window's opening size is
what puts the column where it belongs: at 1200 wide (`apps/desktop/src/main/window.ts`) the page is about
900px and a line of prose about 830 — the band every chat client settles in — and a maximized window
is capped by the measure rather than by the column.

## C5.4 — Space and shape

A 0.25rem base scale, used as `1, 2, 3, 4, 6, 8, 12` (Tailwind's `p-1`…`p-12`). Borders are 1px
hairlines. **Soft corners, and nothing is square** (ADR-0017): `--radius-control` `0.625rem` for a
button, a chip, a field, a row; `--radius-card` `1rem` for a panel, the page, a block in it, the
composer's bar; `--radius-overlay` `1.25rem` for a menu and the command palette. Chips and state
dots are pills (`rounded-full`). There are three radii and no fourth: a component that wants a
different corner wants a different element.

**Height comes from three shadows, edges come from hairlines.** `--shadow-card` lifts the page and
the rail off the window; `--shadow-soft` lifts what floats a little less — the composer's bar, the
row you are in, a grouped control inside a form; `--shadow-overlay` is for the only things that
leave the page entirely — a menu, the command palette — and it is the one that has to read against
whatever is under it. All three are low-alpha and wide: a menu casting a black halo is the thing
that makes a soft interface look cheap in one screenshot. The dark palette carries the stronger
set, because a dark page swallows the first of them. A shadow is never drawn where a hairline would
have done, and nothing has both a heavy border and a shadow.

**The window has a gutter, and two panels sit in it.** A half-rem all the way round, on
`--ink-900`. The rail is a rounded panel; the page — the conversation, the tasks list, the settings
panel — is a rounded panel beside it with a hairline and `--shadow-card`, taking the rest of the
window. Nothing is full bleed except the window itself, and the strip at the top holds only the
app's mark and the window's own controls.

**The margin is a column, not a rule.** Two columns, imported from `components/ledger.ts` so
nothing re-derives them: the leading column (`MARK_COLUMN`, 1.5rem) and the gap after it (1rem),
then the text block (`PAGE` is the page's own padding). An entry's number sits right-aligned in the
leading column, two digits, mono, faint; an answer leaves the column empty, which is what keeps
every line of the page starting at the same x. There is no vertical rule down the page: the number
says what the column is for.

**An entry is a log line.** The reader's own words sit in the text block at the same left edge and
the same size as the answer, opened by the number in the margin and closed by a hairline under
everything that belongs to the entry. Nothing is filled, outlined or aligned to the right: what
tells the request from the work is the number, the rule and the gap between turns. The entry's
actions (copy, edit) are revealed on hover and on focus, so an entry at rest is its number, its
words and its rule. The assistant's answer keeps its own action row visible, because that is the
thing a reader copies.

**The composer is a bar, and a command line.** A rounded bar floating at the foot of the page, in
the page's reading column and one column in from its edge so its words start where every entry's
words start. It grows with what is written into it (`field-sizing-content`) rather than being a
fixed box, and it explains nothing about itself: there is no line under the words saying what the
box can do, because the control that decides it — the model, the level, the attach button — is
already in the row below. The one thing that can appear under them is a refusal no control could
have said (an `AttachmentNote`: a picture the model cannot take, or one past the size limit).
Everything the message carries or is allowed to do sits in one row under the words: the way in to the file picker and the level
chip at the left, the model it will run on and the control that sends it at the right. Both chips
follow one rule — with a conversation open they change that conversation, and with none open they
change what the next one starts with — and neither is duplicated in the head, because a setting
lives where the message that uses it is
written.

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
by their own hover and by the lifted row the current one is. Two repetitions *are* ruled, and both
are logs read line by line: the ledger of tool calls, and the events inside an expanded row (C5.5).
An entry's rule is the one exception that is not a separation: it closes what the reader asked, and
the work hangs under it. A rule is `--line`, one step lighter than the text around it, and never a
shadow.

**Glass, and light.** Two materials complete the depth system, and both are earned by being used
exactly where they are the only honest answer (ADR-0020). **Glass** — `backdrop-blur` under a
translucent chrome fill — is for the two surfaces the page slides beneath: the head and the
composer's bar, which float so the transcript passes visibly under them. **Light** is the glow: the
accent casting its own light on what is lit by it — the primary button, the cursor, the hearth at
the foot of the page that brightens while the agent works and settles when it is done. Nothing else
blurs, nothing else glows, and depth is still, first and last, a change of surface.

**A turn ends with a line.** The last answer of a turn is closed by a hairline the width of the
text block with what the turn spent at its right end — mono, faint, one line. It is the one rule in
the app that carries text, and it is what lets a long conversation be read as turns rather than as
one run of prose; the running total stays in the page's head, where it belongs to the conversation.

**A form is a panel of groups.** The fields of one concern stand together, the groups are separated
by hairlines, and the form ends the way the gate ends: a rule, then the actions at the right end,
primary last. A field's own label sits above it in `text-xs`, and the line that explains it is
`text-micro`, faint, with room to wrap. A section's name is set in the mono micro upper case the
column labels use — the same voice that says `Folders` and `Gate` — because a form's groups and a
record's fields are the same kind of thing: parts of one thing, named.

**The rail's columns.** Every row in the rail is built on three x-positions, so a list of folders
and their conversations reads as one grid: the glyph at 0.5rem (an action row's icon; a folder
leaves this column empty, because folding is the row's own click and there is no chevron to aim at —
and the column stays, because the grid is what lines a folder up with the conversations under it),
the second column at 1.75rem (a folder's glyph, a conversation's status dot,
centred in its own 1rem box), and the third at 3.25rem (the name). The conversation you are in is a
lifted row — the page's own fill, a rounded row, `--shadow-soft` — and the accent is not spent on
saying where you are. A row that puts a name anywhere else is the thing that makes a rail look
hand-assembled.

**A folder with nothing under it is a heading.** Its row names the folder and says there is nothing
in it; it is not a button, it has no `aria-expanded`, and clicking it folds nothing, because there is
nothing to fold. A row that offers a fold over an empty section is a control that does nothing.

**The rail's groups, and the one action that is a glyph.** The rows above the index are three
things and only three: the one row that *starts* something (a new conversation, with the folder it
will land in written under it), then the rows that *go* somewhere (search, tasks), then the index.
They are all the same size, so the two hairlines between them are the only thing that can say which
is which — a rail whose actions run together is a rail where the fourth row means nothing. A control
that acts on the index itself belongs *in* the index's heading row: adding a folder is a glyph at
the right end of `Folders`, beside its count, and never a row of its own. A row spent on it reads as
a fourth place to go, and it costs the rail a line of height to say something the `+` says in 1.25rem.

**Lengths are rem, and the checker says so.** `05-design:no-px-lengths` fails `pnpm check` on any
px length inside `apps/desktop/src/renderer/`, with exactly one exception: `1px` hairlines, which have to
stay a device pixel to stay crisp.

## C5.5 — The distinctive pieces

Six elements carry the identity. They must be recognisable from a screenshot with the text
removed:

1. **The page and its numbered column.** A rounded page floating in the window, a rail panel
   beside it, and a leading column down the page where each entry's number is written and the
   answers leave it empty. This is the thing that says "ledger" before a word is read.
2. **The ledger row.** Every tool call is a ruled line rather than a card, with **fixed column
   widths** — risk glyph, mono tool name, argument summary, who let it through, status, duration —
   so that a stack of rows is a table and not a list of sentences. Opening a row drops a rounded
   filled panel under it: arguments, the gate's note, output, diff, each under a mono micro heading.
3. **The mark.** A small rounded badge in the accent with an `A` in it, followed by the app's name
   in mono upper case, at the top left of the window. It is the only place the app signs the page,
   and the same mark signs the unlock screen.
4. **The gate.** A pending approval is not a modal and not a card in the transcript's flow. It is a
   rounded block with an amber tint, a soft shadow and an amber edge, holding the exact command,
   its working directory, and three decisions: Allow once, Always allow (with the scope it will be
   remembered for), Deny.
5. **The ember cursor.** Streaming text is followed by a 0.125rem copper block that pulses at
   1.2s. It is the only animation running in a resting window.
6. **The two chips at the foot of the composer.** The permission level is a coloured chip with a
   one-word label at the left of the foot, and the model is a quiet chip naming the model at the
   right: what the message about to be typed is allowed to do and what it will run on, both next to
   the message itself. The level chip is never hidden, including in `full-access`.


## C5.6 — Motion

150–220ms, `ease-out`, and only for: message arrival (6px rise, fade), tool row state change,
overlay entry, and the ember cursor. The one slow change is the hearth — the light at the foot of
the page — which fades over a full second when a turn starts and settles over one when it ends, at
the pace of a room, not of a control. On hover, only two things change: colour and border — plus the
one deliberate exception, a row's own actions fading in over the row (`opacity`, and `focus-within`
reveals them for the keyboard as well, so nothing is hover-only). Nothing moves on hover.
`prefers-reduced-motion: reduce` collapses every transition to 0ms and freezes the ember cursor.

## C5.7 — Accessibility floor

Keyboard reachable: every control, including the approval buttons, with a visible 0.125rem ember focus
ring that is never removed. The approval prompt takes focus when it appears and is operable with
`Enter` (allow once) and `Escape` (deny). Colour is never the only carrier of meaning: each level
chip pairs its colour with its name, each tool status pairs its colour with a glyph, and the row you
are in pairs its fill with `aria-current`. **A menu marks what is in force the same way everywhere**
— the row is filled and carries the accent check, while the state itself is `aria-checked` — so the
level menu and the model menu are read as the same control twice rather than as two controls that
happen to look similar. A mark that only a screen reader knows about is half a mark.

**Decoration is hidden from a reader.** The entry numbers are `aria-hidden`: they are the page's
furniture, and a reader being told "zero one" before every message is being read a layout instead
of a transcript. The same goes for a rule drawn as an empty `span`, and for the middots that
separate a page head's facts.

## C5.8 — Copy

Sentence case for everything except proper nouns. Buttons say what they do ("Allow once", not
"OK"). Empty states explain the next action in one sentence and offer it as a button. Errors say
what failed, where, and what to do next; they never apologise and never blame the user.
