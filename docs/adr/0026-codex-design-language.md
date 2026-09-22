# Codex: paper, two inks, two voices

> **Superseded by [ADR-0027](0027-caliper-design-language.md)** — kept for the history it records.

2026-09-22 · Supersedes [0005](0005-ember-ink-design-language.md), [0016](0016-the-page-the-margin-and-the-stamp.md),
[0017](0017-soft-corners-and-the-page-stays.md), [0019](0019-a-display-voice.md),
[0020](0020-glass-light-and-the-room-that-breathes.md), [0023](0023-iris-design-language.md),
[0024](0024-spine-and-a-conversation.md); in design matters also [0021](0021-the-window-is-solid.md)

## Context

Iris — cool porcelain, floating rounded panels in a gutter, one electric indigo signal, glass and
glow — was the second design language of this app after the warm "ember ink" it replaced. It was
built deliberately and defended in writing, and it aged into chrome: three surface steps, five
accent palettes, three radii and three shadows to keep in one head, and a window whose softness
read as decoration on a tool someone keeps open all day. The instruction for this pass was a
complete redesign on one person's taste, not another calibration of Iris.

## Decision

The window is **Codex**: one ruled sheet of warm laid paper, black ink, and one second ink —
rubric red. A conversation is a text being composed; everything the machine measures or operates
is apparatus, set small in mono around it. Concretely, and all of it in
[05-design.md](../constraints/05-design.md):

- **One surface.** The window is full bleed and ruled into an index column and a page by a
  hairline. No gutter, no floating panels, no shadows, no blur, no glow. Depth is a sunk well or
  a rule (supersedes 0017's soft corners and 0020's glass and light).
- **Two inks, one of them chosen.** Rubric red is the only accent — no accent palette
  (supersedes 0005, 0023). It marks only what is live or decisive: the streaming caret, the
  working dot, the current row's tick, primary actions, the approval's spine, `full-access`, and
  failure. Level colours are fixed stamps — lapis, amber, jade, rubric (supersedes 0016's stamp
  vocabulary, 0024's Iris shapes).
- **Two voices.** A serif speaks the text — messages, titles, names in the index. Mono speaks the
  apparatus — labels, buttons, chips, measurements, code. There is no sans and no third face
  (supersedes 0019's single-grotesque display voice).
- **The page fills the pane.** One content edge at every window width, prose included; only
  interface sentences keep a reading measure (0016's page-and-margin ruling is retired).

## Consequences

- `tools/design/theme.test.ts` measures the two palettes numerically; `e2e/design.spec.ts` holds
  the geometry and the pointer's answers; `pnpm check:constraints` enforces rem lengths, the two
  voices, the focus ring and the copy dictionary.
- The appearance settings lose the accent picker — the rubric is the identity, not a preference.
  `accent` leaves the persisted state and the window contract.
- Screens written in the old vocabulary — rounded cards, glass bands, accent gradients — are gone
  wholesale; no migration path exists between the two languages and none is wanted.
