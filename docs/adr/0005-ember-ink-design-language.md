# Ember Ink: a warm-ink, single-accent design language

Alpha's interface uses warm near-black surfaces (`#14110E` family), parchment text, and exactly
one saturated accent — copper `#E2762F` — with jade, amber, danger and info reserved for state.

## Context

The category has a default look: cold slate or blue-black surfaces with a violet accent, a
pattern set by the first generation of chat apps and copied since. A workbench that adopts it is
indistinguishable from its competitors in a screenshot, which matters for a tool the user chooses
by look as much as by capability. The requirement was a distinctive style and palette that still
reads as a professional tool, not a theme.

## Considered options

- **Cyberpunk / neon-on-black.** Rejected: high-contrast neon is fatiguing over a long session,
  and it codes as "toy" for a tool that runs shell commands on real files.
- **Cold neutral with a green "run" accent.** The category default; rejected as indistinct.
- **Warm ink with a single copper accent** (chosen). Warmth differentiates on sight, copper
  doubles as the "working" signal for streaming and focus, and the restrained palette leaves
  colour as a reliable carrier of state — level chips, tool status, approval.

## Consequences

Colour carries meaning, so it cannot be spent on decoration: every saturated pixel in a resting
window is either the accent on an active element or a state colour on a state. Contrast is
asserted by test rather than reviewed by eye, and the four identity elements in
[05-design.md](../constraints/05-design.md) are the ones that must survive a redesign.
