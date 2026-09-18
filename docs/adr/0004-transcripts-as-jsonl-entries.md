# Transcripts are pi's JSONL session entries, not an Alpha-owned store

A conversation's transcript is persisted as `pi-agent-core`'s format-4 JSONL entries through
`JsonlSessionRepo`, one directory per conversation under the app's data directory. Alpha stores
only conversation metadata (title, workspace, model, level, timestamps) alongside it.

## Context

The workbench needs resumable conversations, a browsable list, and the ability to render a
transcript that was produced by a run the user has since quit. Writing an Alpha-shaped store
would mean re-implementing append-only writes, ordering, and the mapping from runtime messages to
disk — and would then have to keep pace with the harness's own entry types (compaction
summaries, branch summaries, bash executions, custom entries).

## Considered options

- **SQLite via a native module.** Better queries, but a native build dependency and a schema to
  migrate, for a dataset that is a few thousand small text entries.
- **One JSON file per conversation.** Simple, and rewriting the whole file per message end.
  Workable, but it duplicates a format the harness already defines and validates.
- **The harness's JSONL session** (chosen). Compaction, branch navigation, and entry projection
  work out of the box, and a transcript written by Alpha is readable by any pi-based tool.

## Consequences

Alpha follows the harness's format version, including a migration if it changes. Session
directories are plain files a user can copy, inspect, or delete by hand — which is consistent
with the local-first stance in the scope constraints. Alpha never hand-edits an entry: it reads
entries through the session reader and writes only via `lane.prompt` and friends.
