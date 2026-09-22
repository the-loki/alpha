# Iris: a cool-porcelain, single-signal design language

> **Superseded by [ADR-0026](0026-codex-design-language.md)** — kept for the history it records.
Alpha's interface uses cool porcelain surfaces (`#ECEEF3` family light, `#0C0E13` family dark),
graphite text, and exactly one saturated accent — electric indigo, the `iris` slot — with jade,
amber, danger and info reserved for state. The bundled display face is Inter; the measuring face
is JetBrains Mono.

## Context

The first language, [0005](0005-ember-ink-design-language.md), bet on warmth: paper surfaces, a
copper accent, and a serif display voice. In the window it turned out the warmth was a tax. Every
neutral had to be tuned to keep two percent of hue without going beige, the copper sat beside the
amber of `ask` and the orange of `full-access` as a third earth tone, and the serif — the one
element that carried the most identity — read as a costume on a tool that runs shell commands.
Screenshots read as sepia next to every cold competitor, which is differentiation, but as *aged*
rather than as *distinct*.

The requirement is unchanged from 0005: a look that is recognisably Alpha's in one screenshot,
that stays professional over a six-hour session, and that leaves saturated colour as a reliable
carrier of state.

## Considered options

- **Keep warm ink, retune values.** Rejected: the beige pull and the three-earth-tone collision
  are properties of the hue family, not of the specific hexes.
- **The category default: cold slate, violet accent, a second display face.** This is where Iris
  lands on hue — deliberately. The differentiator moved from *the neutrals' temperature* to
  *discipline*: one accent doing all the signalling (focus, streaming, primary, the lit row), one
  gradient in the whole app (the mark and the primary share it), and one voice for everything
  that is not data.
- **A second, serif-free voice for display.** Chosen in effect, then collapsed further: display
  and sans are the *same* face, distinguished by size, weight and tracking — a distinction the
  layout carries instead of a costume.

## Decision

**Iris.** Cool porcelain neutrals carrying two percent of blue, graphite ink, electric indigo as
the default accent (ember, sage, rose and plum stay as choices), and a two-face system: Inter for
everything said, JetBrains Mono for everything measured. Corners tighten to 0.5/0.75/1rem, the
row you are in is lit by the accent rather than lifted by a shadow, and the approval gate wears an
amber spine down its left edge. The full token table, the surface ladder and the laws live in
[05-design](../constraints/05-design.md), which this ADR does not duplicate.

## Consequences

Warmth is no longer the identifier, so the identifier is *restraint*: every saturated pixel in a
resting window is the accent on an active element or a state colour on a state, and the contrast
floor (4.5:1 for text, per palette, per accent) is asserted by `tools/design/theme.test.ts` and
the window-measuring specs rather than reviewed by eye. Chinese text still falls to the machine's
own faces — Inter and JetBrains Mono bundle no CJK glyphs — and the stacks name those faces for
the same reason 0005's did.

The serif display voice of 0005 is gone: `--font-display` now names the Inter stack, and what it
marks — a page's title, a screen's own name — is set semibold and tightened
(`tracking-tight`) instead of set in a second family.

## Amendment: the ledger numbers are gone

The numbered leading column this language inherited from [0016](0016-the-page-the-margin-and-the-stamp.md)
did not survive contact with the transcript. A number beside every message is furniture: it says
nothing about what was asked or what answered, and it taxes every line of the page with a margin
that answers no question. The transcript is one conversation column now, the way the mainstream
LLM workbenches draw one: the reader's words sit in a bubble of the page's own surface at the
column's right edge, and everything that answers them — thinking, tool calls, the answer — stands
full width and unboxed on the column. The composer's bar stands on the column's own edge, because
what is being typed is the next thing said. See [0024](0024-spine-and-a-conversation.md) for
the window structure this sits in.
