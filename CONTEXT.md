# Context: Alpha

Alpha is a local-first desktop workbench that embeds its agent: a conversation runs in the
workbench's own process, on an agent assembled from a plugin base of Alpha's own — the coding
tools, the permission gate, compaction, auto-retry — against a folder on your machine. This file
is the glossary: the words the project uses, and the words it refuses to use as synonyms. It
holds no implementation details.

## Vocabulary

### Workbench

The desktop application as a whole: one window, several conversations, one agent runtime.
Avoid: *app*, *client*, *studio*.

### Workspace

A folder on disk that conversations are scoped to. Every conversation belongs to exactly one
workspace. A workspace carries its own permission defaults and its own agent instructions.
The workbench holds several at once and shows them together; one of them is *current*, which
means no more than this: the one the next conversation will be created in.
Avoid: *project*, *repo*, *directory* (a directory is a filesystem fact, not a domain object).

### Language

Which of the two languages the interface is written in — `en` or `zh`. A setting of the
workbench, not of a conversation: what the agent is told stays in the language the conversation
is in, so the two can differ without either being wrong. Avoid: *locale* (that is the machine's,
and the workbench only reads it to answer `system`).

*Dictionary* is the interface's own words: the keys and their two translations. It holds chrome
only — never what the agent is told, and never a vendor's sentence.

### Conversation

One thread of messages between the user and the agent, persisted and resumable. A conversation
is bound to one workspace and one model for its lifetime. Avoid: *chat*, *session*.

*Session* is reserved for the runtime's persistence unit (the JSONL transcript, the lane), and
is deliberately not the user-facing word.

### Turn

One agent loop iteration: one model call plus every tool execution it requested. A conversation
is a sequence of turns.

### Message

One user-visible unit in a conversation: what the user typed, what the model produced, or what a
tool returned. Messages are the only thing the transcript stores.

### Entry

One thing the user asked for, drawn as a bubble at the column's right edge: a message the user
typed, seen as one turn's opening, with the work that answers it standing under it on the column.
Avoid: *row*, *item*. `Entry` is the display word for the user's own messages and nothing else —
the model's answers are `messages` and the calls it makes are `tools`.

### Page

The surface a conversation is read on: a rounded panel floating in the window, one column wide, where
the reader's bubble is set to the right and everything that answers it stands full width and unboxed
(ADR-0016, ADR-0017, ADR-0024). A page wears a band that says what it is — and the band stands on the
page's own padding rather than on its column, so that no part of a page's chrome moves when the window
changes width. Avoid: *card*, *panel*, *pane*, *sheet*.

### Column

The width a page is written on: the page's own pair of edges, one padding in. The reader's message,
the answers, the tool lines, the turn footers and the composer all stand on it, and the reader's
message is set against its right end. Nothing is centred and nothing is capped — a centred column
moves its reading edge every time the window changes width, and a capped one leaves the window's
room unused — except a *sentence of the interface* (a panel's note, an empty state), which keeps the
reading measure because it is a label and not content (C5.3, C5.4). Avoid: *margin*, *gutter*,
*content area*, *container*.

### Attachment

A picture the user sends with a message. It travels as bytes rather than as a path, so the model
is handed the picture itself and the transcript keeps it: a message means the same thing when it
is re-read as it did when it was sent. Pictures only — a provider takes images and nothing else —
and the composer is where they are picked and where a file that is too large is refused. Avoid:
*file* (an attachment is a picture, and nothing about the folder is involved).

### Archived Conversation

A conversation that has been put away: it keeps its transcript and stays usable, and it lives in
the archived section rather than in its folder. Sending it a message takes it back out — the state
is one flag on the conversation's entry in the list, never a change to the transcript. A
conversation that is working, or waiting on an answer, is not archived: the card asking for that
answer lives inside it. Avoid: *closed*, *deleted* (deleting is the other action, and it is final).

### Task

A prompt the workbench runs on its own, in one workspace, at a level chosen when the task is made
and frozen with it: a schedule, a name, and the promise that it may act that far while nobody is
watching. A task that is stopped keeps its prompt and its runs. Avoid: *job*, *cron* (that is one
way of writing a schedule, and this workbench does not use it).

*Run* is one execution of a task: a conversation of its own, titled with the task's name, started
by the clock or by hand. A run that missed its moment while the workbench was closed is caught up
once, and a run nobody is watching refuses a call that would ask rather than waiting.

### Queued Message

What the user typed while the agent was working and meant to send *after* it: it waits in the
workbench's own queue and becomes a turn of its own when the current one ends. A queued message is
not yet part of the conversation, so it can still be edited in place or deleted. The queue belongs
to a conversation and dies with the workbench — it is an intention for the next few minutes, not a
record. Avoid: *pending* (everything not yet finished is pending; this is one specific thing).

### Steered Message

What the user typed while the agent was working and meant to send *into* it: it goes to the
running turn at its next checkpoint, and it is the runtime's, not the workbench's. A steered
message cannot be edited — by the time you would edit it, it belongs to the turn — and it can only
be cancelled, which the runtime may answer with "too late". Avoid: *interrupt* (that is stopping
the agent, which is a different action on a different control).

*Queued* and *steered* are the two answers to "what happens to what I type while the agent is
working?", and they are deliberately not synonyms: one changes the next turn, the other changes
this one.

### Plugin

One part the agent is assembled from: a name and the hook faces it contributes — the tools it adds,
what it may block before a call runs, what it does when a run ends. Alpha's own base, never an
extension format: the built-ins ship as the first plugins. Avoid: *extension*, *add-on*.

### Base

Not a place, a role: the base is the workbench as the thing capabilities are written for — it
registers them, drives a run and judges its end, and it is why Alpha's plugins are Alpha's own
rather than another product's extension format. Two packages carry the role's two halves: the
plugin base is the contract a plugin is written against (`@alpha/plugin`, pure), and `@alpha/agent`
is the mechanism, where those faces meet pi — the assembly and the `afterRun` driver. Avoid:
*extension host*, *core*, *kernel*, and calling any one package "the base".

### Tool

A capability the agent can invoke: reading a file, writing a file, running a command. A tool
never executes without passing the permission gate.

### Permission Level

The standing answer to "may the agent act without asking?". Exactly four levels exist:

| Level | Meaning |
| --- | --- |
| `plan` | Read-only. Nothing that writes or executes is allowed; the agent is told to propose instead of act. |
| `ask` | Every write and every command asks first. Reading is free. |
| `accept-edits` | File changes are auto-approved; commands still ask. |
| `full-access` | Nothing asks. The user has accepted the blast radius. |

The level is chosen per conversation, at the foot of the composer — the chip shows the level in
force for what is about to be typed, and with no conversation open it sets the default the next
one starts at.

Avoid: *mode* (that word is for the permission level *and* the thinking effort *and* the theme,
so it names nothing), *sandbox* (Alpha does not sandbox; it gates).

### Approval

A single decision the user makes about one pending tool call: allow once, allow for the rest of
the conversation, allow everywhere in this workspace, or deny. An approval is not a permission
level: the level decides whether an approval is needed at all.

### Permission Rule

A remembered approval: a tool name plus an argument pattern, scoped to one conversation or to
every conversation in the workspace. Rules are what "always allow" writes, and they outrank the
level — including in Plan, where a rule approves what the level would block.

### Provider

A connection to an upstream model API: a base URL, one of the three wire protocols Alpha speaks
(OpenAI chat completions, OpenAI responses, Anthropic messages), and the credential that goes with
it. Alpha ships no catalog and no hosts, so every provider is one the user described. The models
that travel over it are its own sub-list, edited inside the provider's card. Avoid: *backend*,
*vendor*, *endpoint* (a provider is the connection, not the address).

### Credential

The secret that authenticates a provider — in practice an API key. Credentials are owned by the
user (BYOK), stored encrypted on this machine, and never transmitted anywhere except to the
provider they belong to. Avoid: *token* (confusable with model tokens), *password*.

### Model

A specific model id served by a provider, with the context window, the token limits and the
capability the workbench needs to run it. A model is always addressed as provider + id, and the
list of them is a model setting rather than a fact about the connection. **Takes pictures** is one
of those capabilities: it says whether a picture may be attached to a message for that model, it
is off until it is turned on, and a picture for a model without it is refused rather than sent
(ADR-0018). One of them is the **default model**: what a new
conversation starts on, and what a run with nobody watching uses. A conversation's own model is
chosen at the foot of its composer, and the chip there follows the level chip's rule — with a
conversation open it changes that conversation, with none open it changes the default.

### Thinking Effort

How much reasoning the model is asked to spend before answering. This is the *thinking effort*
knob, and it is unrelated to the permission level despite both being called modes in other apps.

### Transcript

The persisted, replayable record of a conversation: its messages, tool calls, and results.
Rendered by the workbench; never edited by hand. The store is Alpha's own — append-only JSONL
entries, written as the run produces them — and a transcript written in the pi era is read in
place, not converted.

### History

The messages an agent starts a run with, folded from the transcript's entries: every message entry
crosses as it was written, and a compaction stands in for everything before it. The transcript is
what is stored; the history is what the agent reads. Avoid: *context*, which is pi's word for the
same array and says nothing about where it came from.
