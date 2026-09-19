# 05 — Design

Alpha must look like a tool someone works in for six hours, not like a landing page. The
visual language is called **Ember Ink**: warm near-black surfaces, parchment text, and a single
copper accent that is the only saturated colour in a resting window.

## C5.1 — Why warm

Every agent app in this category is cold: slate, zinc, blue-black, and a violet accent. Warm ink
separates Alpha on sight, and it is not decoration: warmer hues at low luminance are easier to
sit in front of for a long session than pure black, and the copper accent reads as a working
lamp rather than a status LED.

## C5.2 — Tokens

These are the only colours in the app. Components reference tokens, never raw hex.

**Light is the default theme.** The window is painted before any state is read, so the palette in
`@theme` is the light one and the dark palette is the override. `prefers-color-scheme` is resolved
in the renderer, not in the stylesheet: `system` is a *choice* between two palettes rather than a
third palette, and resolving it once keeps the stylesheet to plain selectors.

| Token | Light (default) | Dark | Use |
| --- | --- | --- | --- |
| `--ink-900` | `#F3F3F5` | `#17171A` | The page behind everything |
| `--ink-800` | `#F3F3F5` | `#1D1D20` | The sidebar, and the composer's own surface |
| `--ink-700` | `#FFFFFF` | `#232327` | Cards: the content pane and the settings panels |
| `--ink-600` | `#E9E9EC` | `#2C2C32` | Hover, and the selected row |
| `--line` | `#E2E2E6` | `#33333A` | Hairline borders, dividers |
| `--line-strong` | `#C7C7CF` | `#4A4A54` | Focused input border |
| `--parchment` | `#17171A` | `#F4F4F6` | Primary text |
| `--parchment-dim` | `#55555F` | `#A4A4AE` | Secondary text, labels |
| `--parchment-faint` | `#767680` | `#7D7D87` | Metadata, timestamps |
| `--warm` | `#A8481A` | `#E2762F` | The `full-access` level, and nothing else |
| `--jade` | `#1F6B4C` | `#56B394` | Success, connected, auto-approved |
| `--amber` | `#7A520E` | `#DFA947` | Waiting on the user, warnings |
| `--danger` | `#B02A25` | `#E46B64` | Denied, failed, destructive |
| `--info` | `#2F5399` | `#7B9ADA` | Neutral system notices |

The surfaces are neutral grey and the cards are white, so the page and the content separate without
another border around the window: the content pane and each settings panel are a rounded card
floating on `--ink-900`. **The accent is the only colour in the chrome** — everything else is the
grey scale above plus the four semantic tokens.

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
| Conversation titles in the sidebar | JetBrains Mono | `text-code` | 0.78125rem / 1.55 | regular |
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
under `packages/renderer/`.

**`text-ui` and `text-xs` are one pixel apart and are not interchangeable.** The boundary is the
two voices again: `text-ui` is what a thing *is* (a name, a label, a sentence in the interface);
`text-xs` is what a control *says*, and the metadata around it (a button's word, a hint, a chip). A
row's name is `text-ui`; the action at the end of that row is `text-xs`.

Both families are bundled with the app; there is no runtime font fetch.

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

**Two voices, never swapped.** Sans speaks: every control, every label, every sentence. Mono
measures: paths, counts, tokens, shortcuts, identifiers, code. So an action is set in sans
wherever it appears — as a word under a message, a row in the sidebar, or a button in a toolbar —
and mono inside a button is data the button is carrying (the shortcut it answers to), not the
button's own voice. `05-design:control-voice` fails `pnpm check` on a `<button>` whose own
className says `font-mono`.

The token carries the leading for its role; a paragraph of UI text that wraps anyway (empty
states, the sentence under a control) may add `leading-relaxed` on top of it.

**Width.** The transcript column fills the pane: tool rows, diffs, tables and code blocks take the
full width, because that is where long lines belong. Prose is capped at 100 characters of measure
(`max-w-measure`, declared as `--container-measure` in the theme) on the assistant's markdown root
and the user's bubble — the assistant's prose is the one thing that reads worse the wider it gets.

## C5.4 — Space and shape

A 0.25rem base scale, used as `1, 2, 3, 4, 6, 8, 12` (Tailwind's `p-1`…`p-12`). Radii:
`0.375rem` for controls, `0.75rem` for cards, `1rem` for the content surface and overlays.
Borders are 1px hairlines. Shadows are for things that float over other things — overlays, and
the content card itself, which carries `shadow-card` (weaker on the light palette, where the page
is the lighter of the two surfaces). The composer's focused state is a 1px border change, not a
bloom.

**The composer is narrower than the pane.** A line being typed wants to stay a line, so the
composer is capped and centred (48rem, the same measure the settings page uses) while the
transcript above it takes the whole pane. Everything the message carries or is allowed to do sits
in one row at the foot of the box: the way in to the file picker, the level chip, and the control
that sends it. The words keep the width above that row to themselves.

**Where a rule goes.** A hairline separates two *different kinds* of thing: the window chrome from
the content, a conversation's header from its transcript, that transcript from the composer's band,
the rail's actions from the rail's contents, one folder group from the next, one section of the
settings panel from the next. Two of the same thing repeating get space and nothing else — no rule
between two messages, two conversation rows, or two tool rows, which are already set apart by their
own bubbles and cards. A rule is `--line` at full strength and never a shadow: depth in Alpha is a
change of surface or a 1px line, not a blur.

**The rail's columns.** Every row in the sidebar is built on three x-positions, so a list of
folders and their conversations reads as one grid: the glyph at 0.5rem (the chevron of a folder,
the icon of an action row), the second column at 1.75rem (a folder's glyph, a conversation's
status dot, centred in its own 1rem box), and the third at 3.25rem (the name). A row that puts a
name anywhere else is the thing that makes a rail look hand-assembled.

**Lengths are rem, and the checker says so.** `05-design:no-px-lengths` fails `pnpm check` on any
px length inside `packages/renderer/`, with exactly one exception: `1px` hairlines, which have to
stay a device pixel to stay crisp.

## C5.5 — The distinctive pieces

Four elements carry the identity. They must be recognisable from a screenshot with the text
removed:

1. **The ledger row.** Every tool call renders as a full-width row: risk glyph, mono tool name,
   a one-line argument summary on the right, and duration. Rows stack into a ledger that reads
   like a log, not like chat bubbles.
2. **The gate.** A pending approval is not a modal. It is an amber-railed card inline in the
   transcript with the exact command, its working directory, and three buttons: Allow once,
   Always allow, Deny.
3. **The ember cursor.** Streaming text is followed by a 0.125rem copper block that pulses at
   1.2s. It is the only animation running in a resting window.
4. **The level chip.** The permission level sits at the foot of the composer as a coloured chip
    with a one-word label: the level in force for what is about to be typed, next to the message
    it governs. It is never hidden, including in `full-access`.

## C5.6 — Motion

150–220ms, `ease-out`, and only for: message arrival (6px rise, fade), tool row state change,
overlay entry, and the ember cursor. On hover, only two things change: colour and border — plus the
one deliberate exception, a row's own actions fading in over the row (`opacity`, and `focus-within`
reveals them for the keyboard as well, so nothing is hover-only). Nothing moves on hover.
`prefers-reduced-motion: reduce` collapses every transition to 0ms and freezes the ember cursor.

## C5.7 — Accessibility floor

Keyboard reachable: every control, including the approval buttons, with a visible 0.125rem ember focus
ring that is never removed. The approval prompt takes focus when it appears and is operable with
`Enter` (allow once) and `Escape` (deny). Colour is never the only carrier of meaning: each level
chip pairs its colour with its name, each tool status pairs its colour with a glyph, and a chosen
option pairs its tint with a check mark (the state is also `aria-pressed` / `aria-current`, so a
reader that cannot see either still has it).

## C5.8 — Copy

Sentence case for everything except proper nouns. Buttons say what they do ("Allow once", not
"OK"). Empty states explain the next action in one sentence and offer it as a button. Errors say
what failed, where, and what to do next; they never apologise and never blame the user.
