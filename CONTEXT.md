# Context: Alpha

Alpha is a local-first desktop workbench for running an AI agent against a folder on your
machine. This file is the glossary: the words the project uses, and the words it refuses to
use as synonyms. It holds no implementation details.

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

### Archived Conversation

A conversation that has been put away: it keeps its transcript and stays usable, and it lives in
the archived section rather than in its folder. Sending it a message takes it back out — the state
is one flag on the conversation's entry in the list, never a change to the transcript. A
conversation that is working, or waiting on an answer, is not archived: the card asking for that
answer lives inside it. Avoid: *closed*, *deleted* (deleting is the other action, and it is final).

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

An upstream model API the workbench can talk to, identified by base URL and wire protocol.
A provider is either built-in (shipped catalog, the user supplies a key) or custom (the user
supplies everything). Avoid: *backend*, *vendor*.

### Credential

The secret that authenticates a provider — in practice an API key. Credentials are owned by the
user (BYOK), stored encrypted on this machine, and never transmitted anywhere except to the
provider they belong to. Avoid: *token* (confusable with model tokens), *password*.

### Model

A specific model id served by a provider, with the context window and token limits the
workbench needs to run it. A model is always addressed as provider + id.

### Thinking Effort

How much reasoning the model is asked to spend before answering. This is the *thinking effort*
knob, and it is unrelated to the permission level despite both being called modes in other apps.

### Transcript

The persisted, replayable record of a conversation: its messages, tool calls, and results.
Rendered by the workbench; never edited by hand.
