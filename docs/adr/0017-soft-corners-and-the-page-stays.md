# Soft corners, and the page stays

Three radii instead of one, two soft shadows, and the page's margin as a *column* rather than a
rule. The structure ADR-0016 introduced — one page, numbered entries, a table for the ledger, a
command line to write in — is unchanged; what changes is the material it is made of.

## Context

ADR-0016 answered "the window looks like every other agent app" with a printed-page metaphor: full
bleed, everything square, rounding and shadow reserved for overlays, a hairline down the margin.
That fixed the shape and overshot the surface. A square sheet with hard rules, square stamps and a
hard full-height margin line is a *printed* page, and the workbench is not a printout: it is a
surface a person sits in front of for six hours, and the harder edges read as crude rather than as
precise. The complaint was that it felt rough, and the parts that felt roughest were the ones with
no radius and no give: the through-line down the margin, the square buttons, the flat bands.

The lesson from both passes is worth writing down, because they look contradictory and are not:
**the structure was the thing that made the app indistinguishable, and the surface is the thing
that makes it pleasant.** ADR-0016 changed the structure and paid for it by making the surface
harsh; this ADR keeps the structure and gives the surface its softness back.

## Decision

**Three radii, and nothing is square.** `--radius-control` is `0.625rem` (a button, a chip, a
field, a row), `--radius-card` is `1rem` (a panel, the page, a block in it, the composer's bar),
`--radius-overlay` is `1.25rem` (a menu, the command palette). Chips and state dots are pills.
The app's mark is a rounded badge, not a stamp.

**Height comes from two soft shadows.** `--shadow-card` lifts the page and the rail off the window;
`--shadow-soft` lifts what floats less — the composer's bar, the row you are on in a rail, a
control group inside a form. Both are low-alpha and wide; neither is a border, and neither is used
to outline a resting surface.

**Hairlines stay, but quieter.** `--line` is one step lighter in both palettes, so a rule reads as a
soft separation rather than as ink. The rules themselves are unchanged in *where* they go (C5.4):
one between kinds of thing, one closing an entry, one closing a turn.

**The margin is a column, not a line.** The page keeps its leading column and its numbered entries —
that is the identity — but the through-line down the margin is gone. The number alone says "this is
the line the work hangs off", and the empty column under an answer is what keeps every line of the
page starting at the same x. A hard vertical line through the whole page was the single roughest
thing in the previous pass.

**The page floats again, the composer bar with it.** The window has a half-rem gutter all the way
round; the rail is a rounded panel and the page is a rounded panel beside it, both on `--ink-900`.
The composer is a rounded bar at the foot of the page, one column in from the page's edge so its
words start where every entry's words start, with the prompt mark at its left. It is not a band and
not a box: it is the thing you write in, floating just above the page's own bottom edge.

**Blocks that were hard-edged become tinted and rounded.** The gate is a rounded block with an amber
tint and a soft shadow rather than a 2px amber rail; an expanded tool row is a rounded filled panel;
the status chips are pills.

## Consequences

- The chrome bands stay where they are (the head of the page, the rail, the composer's bar) but the
  page no longer reaches the window's edges, so nothing but the window itself is full bleed.
- `--shadow-card` and `--shadow-soft` exist again in both palettes. Anything that needs to look
  raised uses one of them; anything that needs an edge uses `--line`.
- The dark palette needs the stronger pair, as before: on a dark page the first shadow is barely
  visible and the second is what carries the lift.
- Rail rows and settings tabs mark where you are with a **lifted pill** (a filled rounded row with
  the soft shadow) instead of the accent rule they had for one pass. The accent goes back to meaning
  only what it meant in ADR-0005: the active element, the streaming answer, the primary action.
- The cost of the earlier version comes back with the rounding: a rounded panel floating in a
  window is a shape every app has, so the *structure* has to keep carrying the identity. The
  numbered entries, the ledger table and the command line are the parts that must not be softened
  into genericity by a later pass.

## Alternatives considered

**Keep the square sheet and only soften the controls.** Half a decision: the hard margin line and
the flat rectangular bands were the rough parts, and leaving them would have kept the feeling the
complaint was about.

**A fully flat soft UI: no shadows at all.** Tried in ADR-0016 (borders only). Without a shadow a
panel has to be told apart by its fill alone, and the light palette's page and rail are one step
apart — the app reads as a wireframe rather than as a calm surface.

**Returning to the pre-0016 layout (a rail of pills beside a card, chat bubbles, a boxed
composer).** That was the version that started this sequence: soft enough, and indistinguishable.
Softness is not the identity; the page, the numbered entries and the command line are.
