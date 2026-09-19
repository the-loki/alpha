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

| Role | Family | Token | Size / line-height |
| --- | --- | --- | --- |
| Body, message text | IBM Plex Sans | `text-body` | 0.9375rem / 1.65 |
| Markdown headings inside a message | IBM Plex Sans | `text-lg`, `text-base`, `text-body` | 1.125, 1, 0.9375rem / 1.4 |
| UI labels, buttons, panel headings, sidebar labels | IBM Plex Sans | `text-ui` | 0.8125rem / 1.4 |
| Conversation titles in the sidebar | JetBrains Mono | `text-code` | 0.78125rem / 1.55 |
| Metadata, chips | IBM Plex Sans | `text-xs` | 0.75rem / 1.3 |
| Code, tool output, diffs, inline code | JetBrains Mono | `text-code` | 0.78125rem / 1.55 |
| Mono metadata: paths, counts, editable fields | JetBrains Mono | `text-xs` | 0.75rem / 1.3 |
| Micro-labels: block markers, status words, action links | JetBrains Mono | `text-micro` | 0.6875rem / 1.3, uppercase, tracking wider |

Both families are bundled with the app; there is no runtime font fetch.

The token carries the leading for its role; a paragraph of UI text that wraps anyway (empty
states, the sentence under a control) may add `leading-relaxed` on top of it.

**Width.** The transcript column fills the pane: tool rows, diffs, tables and code blocks take the
full width, because that is where long lines belong. Prose is capped at 100 characters of measure
(`max-w-measure`, declared as `--container-measure` in the theme) on the assistant's markdown root
and the user's bubble — the assistant's prose is the one thing that reads worse the wider it gets.

## C5.4 — Space and shape

A 0.25rem base scale, used as `1, 2, 3, 4, 6, 8, 12` (Tailwind's `p-1`…`p-12`). Radii:
`0.375rem` for controls, `0.625rem` for cards and the composer, `0.875rem` for overlays. Borders
are 1px hairlines; there are no drop shadows except on overlays and the composer's focused state
(a 1px ember ring plus a soft warm bloom).

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
4. **The level chip.** The permission level sits in the header as a coloured chip with a
    one-word label. It is never hidden, including in `full-access`.

## C5.6 — Motion

150–220ms, `ease-out`, and only for: message arrival (6px rise, fade), tool row state change,
overlay entry, and the ember cursor. Nothing animates on hover except colour and border.
`prefers-reduced-motion: reduce` collapses every transition to 0ms and freezes the ember cursor.

## C5.7 — Accessibility floor

Keyboard reachable: every control, including the approval buttons, with a visible 0.125rem ember focus
ring that is never removed. The approval prompt takes focus when it appears and is operable with
`Enter` (allow once) and `Escape` (deny). Colour is never the only carrier of meaning: each level
chip pairs its colour with its name, and each tool status pairs its colour with a glyph.

## C5.8 — Copy

Sentence case for everything except proper nouns. Buttons say what they do ("Allow once", not
"OK"). Empty states explain the next action in one sentence and offer it as a button. Errors say
what failed, where, and what to do next; they never apologise and never blame the user.
