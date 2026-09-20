# The transcript is the agent's session, and Alpha reads it back

A conversation's transcript is a session the **agent** writes, in the session directory Alpha
points it at. Alpha keeps conversation metadata of its own (title, workspace, model, level,
timestamps, and which session the conversation is on) and the gate's approval decisions
([ADR-0007](0007-gate-decisions-beside-the-session.md)) — the parts that are Alpha's and not the
agent's.

## Context

The workbench needs resumable conversations, a browsable list, and the ability to render a
transcript produced by a run the person has since quit. When Alpha embedded the agent, that meant
owning a store. Now that the agent is the person's `pi`, the file exists whether Alpha reads it or
not: the choice is whether Alpha parses it, or asks the agent to read it.

## Considered options

- **Parse the session files.** Fast, offline, and a second implementation of a format another
  program owns — which then has to keep pace with that program's versions.
- **Read over the protocol** (chosen). `get_entries` and `get_session_stats` answer with the
  session's entries and what it has spent; Alpha maps those into the transcript it draws. Reading a
  conversation that is not open means starting an agent for it, which is the same thing opening it
  does.

## Consequences

- A transcript is the path from the branch tip back to its root, not the whole log. The list keeps
  answers a later edit or regenerate replaced; those are history, and the module that walks the
  path is the only place that knows the difference (#60).
- A session written by an older Alpha is in a format the agent refuses, so it is **copied** into
  one the agent opens, under the conversation's own id, and the old file is left untouched
  (`runtime/legacy-sessions.ts`). Nothing is migrated by rewriting.
- Moving a branch tip is a fork: the agent copies the session up to an entry and carries on there,
  and the conversation records the copy's id. Regenerate and edit are both that
  (`runtime/editing.ts`).
- The list costs one read of Alpha's own index, because the sidebar never talks to an agent.
