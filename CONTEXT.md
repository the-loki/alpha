# Context: Alpha

Alpha is a local-first desktop workbench that embeds its agent: a conversation runs in the
workbench's own process, on an agent assembled from a plugin base of Alpha's own — the workspace
tools, the permission gate, compaction, auto-retry — against a folder on your machine. This file
is the glossary: the words the project uses, and the words it refuses to use as synonyms. It
holds no implementation details.

## Vocabulary

### Workbench

The desktop application as a whole: one window, several conversations, and the agent runtime they
run on — one embedded agent per conversation that is open. A browser client is the same workbench,
served to a browser. Avoid: *app*, *client*, *studio*.

### Workspace

A folder on disk that conversations are scoped to. Every conversation belongs to exactly one
workspace. A workspace carries its own permission defaults and its own agent instructions.
The workbench holds several at once and shows them together; one of them is *current*, which
means no more than this: the one the next conversation will be created in. The rail changes which
one that is, and so does the folder line on the composer of a conversation that has not started.
Avoid: *project*, *repo*, *directory* (a directory is a filesystem fact, not a domain object).

### Language

Which of the two languages the interface is written in — `en` or `zh`. A setting of the
workbench, not of a conversation: changing it does not translate what the agent is told or what
the transcript already contains. Avoid: *locale* (that is the machine's, and the workbench only
reads it to answer `system`).

*Dictionary* is the interface's own words: the keys and their two translations. It holds chrome
only — never what the agent is told, and never a vendor's sentence.

### Conversation

One thread of messages between the user and the agent, persisted and resumable. A conversation
belongs to one workspace for its lifetime; its model may change between turns. Avoid: *chat*,
*session*.

*Session* is reserved for the runtime's persistence unit (the JSONL transcript), and
is deliberately not the user-facing word.

### Turn

One user prompt and the agent run it starts, including any model calls and tool executions before
the run finishes. A conversation is a sequence of turns.

### Turn Refusal

Why a turn did not start. It is Alpha's own case — the conversation has no model, the provider does
not serve the one it chose, a key is missing or unreadable, a picture is handed to a model that takes
none — and it travels as a case rather than as a sentence, because the words belong to the dictionary
in the window's language (ADR-0010). A turn refusal is not a failure: nothing ran, so there is
nothing to retry, and nothing a provider said is ever one — those words are quoted as they came.

Say *turn refusal* for this and *refusal* for the other kind, which is a run with nobody watching
turning down a call that would have asked (ADR-0012): the gate refuses **calls**, Alpha refuses
**turns**, and the two are counted in different places. Avoid: *error* (the word for anything that
went wrong, a provider's included).

### Message

One user-visible unit in a conversation: what the user typed, what the model produced, or what a
tool returned. The transcript also stores entries for compaction, retries and delegated usage.

### Entry

One line of a session's transcript, written as the run produces it: a message, a compaction, a
branch summary, a retry or delegated usage, each carrying an id and the id of the entry it follows.
The entries are the tree a transcript's tip names its way back through, and the transcript is what
they add up to. Distinct from what the window shows: the reader sees *messages*, and a call the
agent made is a *tool row*.

### Page

The surface a conversation is read on: the content area the rail leaves, one column wide, where the
reader's message is set to the right and everything that answers it stands full width and unboxed.
A page wears an **embedded view head** that says what it is — its title in the page's own top row,
standing on the page's padding, with no band above it and no part of that head moving when the
window changes width (C5.4, C5.5). Avoid: *card*, *panel*, *pane*, *sheet*.

### Column

The width a page is written on: the page's own pair of edges, one padding in. The reader's message,
the answers, the tool lines, the turn footers and the composer all stand on it, and the reader's
message is set against its right end. Nothing is centred and nothing is capped — a centred column
moves its reading edge every time the window changes width, and a capped one leaves the window's
room unused — except a *sentence of the interface* (a panel's note, an empty state), which keeps the
reading measure because it is a label and not content (C5.3, C5.4). Avoid: *gutter*, *container*
(the only margin in the product is the margin bar C5.5 names, and it marks the row you are in rather
than anything about the page).

### Attachment

A picture the user sends with a message. It travels as bytes rather than as a path, so the model
is handed the picture itself and the transcript keeps it: a message means the same thing when it
is re-read as it did when it was sent. Pictures only — other file types are not attachments in
this workbench — and the composer is where they are picked and where a file that is too large is
refused. Avoid:
*file* (an attachment is a picture, and nothing about the folder is involved).

### Archived Conversation

A conversation that has been put away: it keeps its transcript and stays usable, and it lives in
the archived section rather than in its folder. Sending it a message takes it back out — the state
is one flag on the conversation's entry in the list, never a change to the transcript. A
conversation that is working, or waiting on an answer, is not archived: the card asking for that
answer lives inside it. Avoid: *closed*, *deleted* (deleting is the other action, and it is final).

### Task

A prompt the workbench runs on its own, in one workspace, at its own permission level (initially
`ask`, and explicitly editable with the task): a schedule, a name, and the promise that it may act
that far while nobody is watching. A task that is stopped keeps its prompt and its runs. Avoid:
*job*, *cron* (that is one way of writing a schedule, and this workbench does not use it).

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
running turn at its next checkpoint. The workbench tracks it while it waits; the agent carries it
into the turn. A steered message cannot be edited, but it can be cancelled while waiting: the
workbench removes it and asks the agent to drop what it still holds. The window lists the steers a
turn was sent for as long as that turn lasts; once the agent has taken one, it is a message of the
conversation like any other, said where the person said it, and the strip is only about what has
not been taken. Avoid: *interrupt* (that is stopping the agent, which is a different action on a
different control).

*Queued* and *steered* are the two answers to "what happens to what I type while the agent is
working?", and they are deliberately not synonyms: one changes the next turn, the other changes
this one.

### Plugin

One part the agent is assembled from: a name and the hook faces it contributes — the tools it adds,
what it may block before a call runs, what it does when a run ends. A plugin may report that its
tool list changed and release resources when its conversation closes. Alpha's own base, never an
extension format: the built-ins ship as the first plugins. Avoid: *extension*, *add-on*.

### Base

Not a place, a role: the base is the workbench as the thing capabilities are written for — it
registers them, drives a run and judges its end, and it is why Alpha's plugins are Alpha's own
rather than another product's extension format. Two packages carry the role's two halves: the
plugin base is the contract a plugin is written against (`@alpha/plugin`, pure), and `@alpha/agent`
is the mechanism, where those faces meet pi — the per-conversation plugin host, assembly and the
`afterRun` driver. Avoid:
*extension host*, *core*, *kernel*, and calling any one package "the base".

### Tool

A capability the agent can invoke: reading a file, writing a file, running a command. A tool
never executes without passing the permission gate. A workbench may also be configured with **MCP
servers** — programs and endpoints that offer tools of their own, written in `mcp.json` and edited
under Settings — whose tools
are tools: the same gate, the same rows, and a name that says which server they came from. A server
is not a plugin: a plugin is Alpha's own assembly (above), and a server is reached over a protocol
(ADR-0028). Avoid: *connector*, *integration*, and calling a server a plugin.

### Subagent

An agent the workbench's agent runs for the length of one `task` call: assembled from the same
plugins — the tools its definition lists, and every block the caller is under — given one
instruction, and answering with one message. It is not a conversation: nothing of its work is written
to a session, and the window sees one row. Avoid: *child agent*, *worker*, *orchestration* (one
delegation happens, not a graph).

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
user (BYOK), kept on this machine, and never transmitted anywhere except to the provider they
belong to. Avoid: *token* (confusable with model tokens), *password*.

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

### Ledger

A conversation as it is read on the page: the messages, the tool rows, and what each call was
decided by, in order — the rendered form of the transcript, and the word the interface uses for the
thing a person audits afterwards. The transcript is what is stored; the ledger is what is read, and
a row in it says what ran *and why nothing stopped it* (ADR-0007).

### Workspace Changes

The net files observed to differ between the start and end of one agent run in its workspace.
The **Changes** view keeps one review per run beside the conversation's transcript, including
work before a failure or Stop. It is an observation of the folder, not a claim that a particular
tool or the agent caused each change; another process may have edited the same files meanwhile.
An incomplete review says some paths were not scanned, not that the listed paths were guessed.
