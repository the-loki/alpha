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

| Token | Value | Use |
| --- | --- | --- |
| `--ink-900` | `#14110E` | Window background |
| `--ink-800` | `#1B1714` | Sidebar, raised panels |
| `--ink-700` | `#221D18` | Cards, composer |
| `--ink-600` | `#2B251F` | Hover, selected row |
| `--line` | `#332C25` | Hairline borders, dividers |
| `--line-strong` | `#443A30` | Focused input border |
| `--parchment` | `#F2EBE1` | Primary text |
| `--parchment-dim` | `#B3A794` | Secondary text, labels |
| `--parchment-faint` | `#837869` | Metadata, timestamps |
| `--ember` | `#E2762F` | Primary accent: streaming, focus ring, primary action |
| `--ember-bright` | `#F08A45` | Accent hover |
| `--ember-ink` | `#1A0F07` | Text on accent |
| `--jade` | `#4FA98B` | Success, connected, auto-approved |
| `--amber` | `#D9A23B` | Waiting on the user, warnings |
| `--danger` | `#D9605A` | Denied, failed, destructive |
| `--info` | `#6D8FD1` | Neutral system notices |

Level colours, used by the permission chip and nowhere else:

| Level | Token |
| --- | --- |
| `plan` | `--info` |
| `ask` | `--amber` |
| `accept-edits` | `--jade` |
| `full-access` | `--ember` |

Every text/background pair above must clear **4.5:1**; `--parchment-faint` is metadata only and
still clears 3:1. Contrast is asserted numerically in a test, not eyeballed.

## C5.3 — Type

| Role | Family | Size / line-height |
| --- | --- | --- |
| Body, message text | IBM Plex Sans | 15 / 1.65 |
| UI labels, buttons | IBM Plex Sans | 13 / 1.4 |
| Metadata, chips | IBM Plex Sans | 12 / 1.35 |
| Code, tool output, paths | JetBrains Mono | 12.5 / 1.55 |

Both families are bundled with the app; there is no runtime font fetch. Message text is capped at
68 characters of measure; tool output and diffs may use the full pane width in mono.

## C5.4 — Space and shape

An 4px base scale, used as `4, 8, 12, 16, 24, 32, 48`. Radii: `6px` for controls, `10px` for
cards and the composer, `14px` for overlays. Borders are 1px hairlines; there are no drop
shadows except on overlays and the composer's focused state (a 1px ember ring plus a soft warm
bloom).

## C5.5 — The distinctive pieces

Four elements carry the identity. They must be recognisable from a screenshot with the text
removed:

1. **The ledger row.** Every tool call renders as a full-width row: risk glyph, mono tool name,
   a one-line argument summary on the right, and duration. Rows stack into a ledger that reads
   like a log, not like chat bubbles.
2. **The gate.** A pending approval is not a modal. It is an amber-railed card inline in the
   transcript with the exact command, its working directory, and three buttons: Allow once,
   Always allow, Deny.
3. **The ember cursor.** Streaming text is followed by a 2px copper block that pulses at
   1.2s. It is the only animation running in a resting window.
4. **The level chip.** The permission level sits in the header as a coloured chip with a
    one-word label. It is never hidden, including in `full-access`.

## C5.6 — Motion

150–220ms, `ease-out`, and only for: message arrival (6px rise, fade), tool row state change,
overlay entry, and the ember cursor. Nothing animates on hover except colour and border.
`prefers-reduced-motion: reduce` collapses every transition to 0ms and freezes the ember cursor.

## C5.7 — Accessibility floor

Keyboard reachable: every control, including the approval buttons, with a visible 2px ember focus
ring that is never removed. The approval prompt takes focus when it appears and is operable with
`Enter` (allow once) and `Escape` (deny). Colour is never the only carrier of meaning: each level
chip pairs its colour with its name, and each tool status pairs its colour with a glyph.

## C5.8 — Copy

Sentence case for everything except proper nouns. Buttons say what they do ("Allow once", not
"OK"). Empty states explain the next action in one sentence and offer it as a button. Errors say
what failed, where, and what to do next; they never apologise and never blame the user.
