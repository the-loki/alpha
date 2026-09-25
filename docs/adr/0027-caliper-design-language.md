# Caliper: an instrument in near-neutral and indigo

2026-09-22 · Supersedes [0026](0026-codex-design-language.md) (and with it, in design matters,
the paper-and-rubric line it inherited from [0005](0005-ember-ink-design-language.md),
[0016](0016-the-page-the-margin-and-the-stamp.md), [0017](0017-soft-corners-and-the-page-stays.md),
[0019](0019-a-display-voice.md), [0020](0020-glass-light-and-the-room-that-breathes.md),
[0023](0023-iris-design-language.md), [0024](0024-spine-and-a-conversation.md))

## Context

Codex — one ruled sheet of warm paper, rubric red as a second ink, serif for what is read — was
chosen on one person's taste and built wholesale. It aged into costume faster than Iris did: the
print metaphor (dot leaders, dockets, colophons, uppercase wide-tracked labels, a `¶` in the
masthead) is a *theme* laid over a tool, and the reference for this pass was named — **Linear and
Raycast**: precision instruments, near-neutral greys, one indigo signal, sans-dominant type, code
and data set in mono. The instruction this time was not only a new look but a more *modern* and
more *refined* one, with the layout reopened (not just the skin) and the old UI tests explicitly
free to be deleted or rewritten. The route is a direct full rewrite: spec locks, then the
components change in place, gates re-cut — no prototype checkpoint.

## Decision

The window is **Caliper** — named for the measuring instrument: the apparatus voice *measures*,
the text voice *reads*, and nothing on screen is a costume. Concretely, all of it in
[05-design.md](../constraints/05-design.md):

- **Near-neutral surfaces, four steps** (page / panel / raised / floating) in both themes, cool
  and close in lightness — hierarchy comes from steps and space, not from rules and shadows.
  Both themes are first-class; the window starts light and can follow the system. The dark palette
  is the design's first draft (supersedes Codex's single warm sheet and its paper/press metaphor).
- **One indigo accent** absorbs what rubric red used to mean — *you are here*, *happening now*,
  *the primary act*, *decisive* (selected rows, streaming caret, primary buttons, focus ring).
  **Red is demoted to danger alone**: failure, destruction, deny. Semantics keep
  success/warning/info. Permission levels are re-stamped: `plan`=info blue, `ask`=amber,
  `accept-edits`=green, `full-access`=red (supersedes 0026's lapis/amber/jade/rubric set and
  the five-accent ban of 0023/0005 — colour is semantic here, not identity).
- **Two voices, sans and mono.** Geist Sans speaks the text (self-hosted, SIL OFL, CJK falls
  through to the system); Geist Mono speaks the apparatus — labels, code, paths, counts,
  shortcuts — in **sentence case** (Codex's uppercase wide-tracked micro labels retire). Weights
  are 400, 500, 600. No serif and no third face (supersedes 0026's serif text voice and 0019's
  display voice alike; the faces are re-chosen within this same rule — both SIL OFL, no
  copyright exposure — replacing Inter + JetBrains Mono for a more precise tool voice).
- **Soft shape, measured motion.** Radius scale 0.25–0.75rem, five shadow levels for floating
  layers and inline decision cards, hairlines where kinds meet and space elsewhere ("structure
  should be felt, not seen"). Motion tokens 100/160/250ms on ease-out-quad; hover answers in colour
  and never moves a box; controls are 2rem standard (supersedes Codex's square corners, zero shadows, 1.75rem).
- **The skeleton is one template everywhere**: a 16rem collapsible rail (folders as collapsible
  sections, flat conversation rows with right-aligned mono meta — no dot leaders, no two-level
  tree, no "index as table of contents"), an *embedded view head* (no standalone band; the
  window's three controls stay locked to the window's top-right corner on every page), a docked
  composer card, and one content edge that never moves when the window widens. Total spend lives
  in a view-head tooltip (the colophon retires). Settings still replaces the rail wholesale.
- **Approval is an inline card** in the transcript — surface step, medium shadow, amber waiting
  mark, three same-height decisions (2rem), command in a copyable mono well — not a printed
  docket with a coloured spine (supersedes 0026's docket form; the structure the e2e locked is
  kept, the print form is not).

## Consequences

- `tools/design/theme.test.ts` re-measures two new palettes, the Geist stacks and the
  level set; `e2e/design.spec.ts` re-cuts its geometry per the re-decided invariants (radius
  scale instead of square, 2rem instead of 1.75rem, Geist Sans+Mono instead of serif+Mono); the
  `05-design` constraint rules change meaning: `two-voices` bans sans/serif/display classes
  (the text voice is `font-text`, now backed by Geist Sans) and `no-other-weights` bans everything
  outside 400/500/600.
- Codex vocabulary leaves the code and the docs with the print form: `paper`/`press`/`sunk`/
  `rubric`/`docket`/`colophon` tokens and comments are renamed as the components are rewritten;
  the `¶` mark retires; the `ALPHA` wordmark stays.
- The appearance settings keep theme and language; theme starts light and offers `system`.
