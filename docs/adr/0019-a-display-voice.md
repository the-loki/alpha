# A display voice: the person's words are set like print

The type system gains a third voice. **Newsreader** — a serif cut for reading, bundled, no runtime
fetch — is the display voice: a page's title, an entry's question, the title page of a conversation
that has not started, the sentence that introduces what a panel is. IBM Plex Sans stays the voice of
the workbench and the agent; JetBrains Mono stays the voice of measurement.

## Context

Every redesign pass ended in the same place: a warm, well-ordered window that was still, at a
glance, *an app*. The palette became genuinely warm only recently (0017's material pass, and the
paper it should have been), the structure is a ledger, and yet a screenshot of the middle of a
conversation could belong to any tool — because everything in it was set in the same sans, at sizes
within a few pixels of each other. Hierarchy was carried by spacing and hairlines alone. What was
missing was **scale and voice**: nothing on the page was ever large, and nothing on the page
belonged to the reader rather than to the machine.

The ledger concept already had the answer in it. A manuscript distinguishes the hand that asks from
the hand that answers and the hand that keeps the accounts. The app already had two of those
voices; the reader's was the missing one.

## Decision

**Newsreader is the display voice, and the display voice speaks for the person.** It is used
exactly where the reader's own hand is at work:

- **An entry's question** — the words the reader typed — set in Newsreader at 1.125rem, a size
  above the answer beside it. The question is the heading of the turn; the work hangs from it.
- **A page's title** (the conversation head, the settings and tasks pages) at 1.25rem.
- **The title page** of a conversation that has not started: the folder's name set large
  (1.875rem), its address in mono under it, and the sentence that explains the page set in the
  display *italic* — the one italic in the app, because that sentence is the closest thing Alpha
  has to handwriting.

Everything else keeps its voice: sans for the workbench's and the agent's words, mono for
measurement. The rule is semantic, not decorative — *serif is the person, sans is the machine, mono
is the measurement* — which is what makes it hold: a designer asking "which voice here?" only has
to ask "who is speaking?".

Weights stay within the scale: Newsreader ships in 400 and 500, plus the 500 italic; the
`no-other-weights` rule is unchanged.

**Lamplight is the one ornament.** The page card carries a wash of the accent across its top —
7%, radial, fourteen rem — the way a desk lamp pools on paper. It carries no information, is
hidden from the accessibility tree, and is the only gradient in the app.

## Consequences

- `--font-display` joins the theme, and C5.3's table gains the display row. The two-voices rule
  becomes three voices, each with an owner; every future "which family here?" question is answered
  by asking who is speaking.
- The transcript gains its scale contrast: a question at 1.125rem serif, the answer at 0.9375rem
  sans, the audit in mono. The difference is now typographic as well as structural.
- The empty state becomes a **title page** — folio number, the folder's name large, its address,
  the sentence in display italic — and the page's head band yields to it: a document says its name
  once, at the opening. With a conversation open the head returns, carrying the conversation's
  title.
- The settings and tasks pages take the display voice on their titles, so every page in the app is
  titled the same way.
- Chinese titles fall through the display stack to the named CJK serifs (`Songti SC`,
  `Noto Serif CJK SC`, `Source Han Serif SC`, `SimSun`) — a title in a song-typeface is a heading,
  where one in a heti is a sign. A machine without any of them draws the title in its default
  serif, which is the same graceful degradation the CJK fallbacks in the sans and mono stacks
  already accept.

## Alternatives considered

**Staying with two voices.** The safest choice, and the one that produced every previous pass: a
window that is orderly, warm, and interchangeable. Distinctiveness requires a voice nobody else is
using; no agent app sets the reader's words in a reading serif.

**A sans display cut** (Inter Display, IBM Plex Sans Condensed). Scale contrast without a voice
contrast: bigger, not different. Rejected for the same reason the two-voice rule was kept for so
long was wrong — the words are the reader's, and they deserve a face that says so.

**Full serif for everything.** A period piece. Prose from the agent at length reads better in sans
on screen, and controls in serif read as costume. The contrast between the two is the point.
