# The transcript is a JSONL session on disk

A conversation's transcript is a session of JSONL entries in the session directory, one file per
session, and the window draws it from those entries. Alpha keeps two things of its own beside it:
conversation metadata (title, workspace, model, level, timestamps, and which session the
conversation is on) and the gate's approval decisions
([ADR-0007](0007-gate-decisions-beside-the-session.md)) — the parts that are Alpha's and not the
session's.

## Superseded in part

Who **writes** the session has moved twice, and the file's own history is worth keeping straight.
The store was Alpha's, then it was the agent's — Alpha drove a `pi` the person installed and read
the transcript back over the protocol, which is the half the title named — and
[ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md) gave the writer back to
Alpha: an append-only JSONL written live as a run produces entries, under pi's folder naming, so
every conversation that already exists keeps opening. This decision settles the *shape*, which
never changed across either move: the session **is** the transcript, entries in an `id`/`parentId`
tree, on disk, read in place rather than imported into a database of Alpha's.

## Context

The workbench needs resumable conversations, a browsable list, and the ability to render a
transcript produced by a run the person has since quit. When Alpha embedded the agent, that meant
owning a store. While the agent was the person's `pi`, the file existed whether Alpha read it or
not: the choice was whether Alpha parsed it, or asked the agent to read it.

## Considered options

- **Parse the session files** (what Alpha does now, with the format its own). Fast, offline — and
  the objection against it then, that it meant a second implementation of a format another program
  owns, went with the child process.
- **Read over the protocol** (chosen then; retired by
  [ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md)). `get_entries` and
  `get_session_stats` answered with the session's entries and what it had spent, and reading a
  conversation that was not open meant starting an agent for it. Nothing starts an agent to read a
  file now.

## Consequences

- A transcript is the path from the branch tip back to its root, not the whole log. The list keeps
  answers a later edit or regenerate replaced; those are history, and the module that walks the
  path is the only place that knows the difference (#60).
- A session an older Alpha wrote is in a format this reader refuses, so it is **copied** into one
  the reader opens, under the conversation's own id, and the old file is left untouched
  (`packages/sessions/src/legacy-sessions.ts`). Nothing is migrated by rewriting. The import runs
  once in the workspace's session directory before a conversation is opened; later opens continue
  the imported file instead of copying the old one again.
- Moving a branch tip is a fork: the session is copied up to an entry and the conversation carries
  on in the copy, whose id it records. Regenerate and edit are both that
  (`runtime/editing.ts`).
- The list costs one read of Alpha's own index, because the sidebar never talks to an agent.
