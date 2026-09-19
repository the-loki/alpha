# Glass, light, and the room that breathes

The page gains two materials beyond paper: **glass** — the head and the composer's bar become
translucent chrome that the transcript slides beneath — and **light** — the accent is allowed to
cast a glow of its own on what is lit by it, with a hearth at the foot of the page that brightens
while the agent works and settles when it is done.

## Context

After the paper material (0017) and the display voice (0019), the window was warm, ordered, and
distinctive in stillness — but it was *still*. Nothing in it responded to the one thing that makes
this app different from a text editor: an agent is working. A turn ran, streamed, and finished, and
the room looked exactly the same throughout. Depth, too, had a ceiling: the earlier rule that depth
is "a change of surface or a 1px line, not a blur" kept every surface flat on top of the last, and
flat-on-flat is a poster, not a room.

The interruption this time was the word *disruptive*. The honest reading is not "change more
things" but "change the one thing everything else is measured against". For a workbench with an
agent in it, that thing is **light**: a room in which the lamp is the agent.

## Decision

**The head and the composer are glass.** They float over the page — absolute layers, not rows in
the column — with `backdrop-blur` under a translucent chrome fill (`--ink-800` at 70%), so the
transcript passes visibly beneath them. The page slides under the head as it scrolls and the
composer rests on the page as a pane rather than a band at the end of it.

**The hearth is the app's one animation of state.** A pool of the accent's own light sits at the
foot of the page, behind the composer. While a turn runs it is lit (full opacity, the composer's
edge and shadow carrying the accent); when the turn ends it settles to embers over a second. It is
decoration entire — `aria-hidden`, `pointer-events: none` — and it is the only place in the window
where state is shown by light.

**The accent is allowed to cast light.** The primary buttons are gradients from the ember to its
darker edge carrying `--shadow-glow`; the streaming cursor carries a small halo of its own. Light
is cast *by* the accent, never by the semantic colours, and never as text-shadow on something being
read.

## Consequences

- `--shadow-glow` joins the shadow scale as the fourth member and the first that is drawn in the
  accent's own colour; like the accent it follows the user's palette choice.
- The page head is an overlay with a fixed height (3.5rem) and the transcript carries the matching
  top padding; the empty state has no head at all, because the title page is the head (0019).
- The earlier rule "depth is never a blur" is reversed, narrowly: exactly two surfaces may blur,
  both because content genuinely passes under them. A panel that blurs without something under it
  is lying about its own depth.
- C5.6 gains the hearth's pace: a full-second fade for a change of state in the room, as against
  the 150–220ms that controls use — the room moves at the pace of a room, not of a button.
- The `backdrop-blur` layers are GPU work that sits outside the transcript's scroll, and the frame
  budget on the five-hundred-message scroll is unchanged by them (measured, 81/81).

## Alternatives considered

**A glowing aurora in the light palette too, at the same strength.** Light mode's identity is
paper under daylight; a strong ember pool reads there as a stain. The light hearth runs at a lower
opacity and stays closer to the composer, which is where it belongs.

**Glass everywhere** — cards, the rail, every band. Glass is expensive to read through; the page's
job is to be readable, and only surfaces that float over it may be translucent. Two surfaces,
that is the whole allowance.

**A progress bar while the agent works.** Rejected: progress is already visible as the answer
growing under the ember cursor, and a bar would measure what the room already shows.
