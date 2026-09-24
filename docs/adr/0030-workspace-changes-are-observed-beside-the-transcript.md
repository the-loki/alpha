# Workspace changes are observed beside the transcript

A conversation can show the final files that changed during each agent run, even when the workspace
has no Git repository and the changes came from a shell command or an MCP tool.

## Context

A tool row reports one call. An edit call may provide a diff, but a write, a command, and an MCP
tool can all change files without returning one. Replaying tool output cannot reliably answer
which files differ when the run ends. Git can answer for a repository, but a workspace is any
folder, and Git's current diff may include work that preceded the run.

The transcript is the conversation's replayable message history (ADR-0004). A final filesystem
comparison is neither a message nor a tool result, so putting it in JSONL would make branch edits
and retries appear to undo or duplicate a fact about the folder.

## Decision

**Observe the workspace before and after one run.** The main process saves a bounded baseline
before the model acts and compares it with the filesystem after the last retry, failure, or Stop.
The review reports net added, modified, and deleted relative paths. It does not attribute a change
to a tool or to the agent: another process can edit the workspace during the same interval.

**Keep reviews beside the transcript.** A per-conversation sidecar in Alpha's data directory holds
the pending baseline and the latest twenty completed reviews. The baseline is written before the
run begins; if the process exits, opening the conversation compares that baseline with the folder
as it stands then and labels the result recovered. Deleting the conversation removes the sidecar.
The renderer receives completed reviews through the normal runtime event and opening snapshot.

**Bound the observation and state its limits.** The scan never follows symlinks; a symlink target
is hashed but not opened. It skips `.git` and `node_modules`, caps entries and bytes read, and
stores text only for small UTF-8 files. An unscanned path makes coverage incomplete. Comparisons
still report changes in other paths whose presence or absence was fully checked. Failure to
capture a review is logged and does not prevent the agent run.

## Consequences

- A review is a filesystem observation, so later user edits do not rewrite an earlier result.
- Large or binary files can be named as changed without a text preview. The Changes view names
  that state and flags incomplete or recovered reviews.
- A review can include a concurrent edit from another process and can miss a path beyond its scan
  budget. The UI must not claim exact tool attribution or exhaustive coverage in that case.
- The baseline costs one bounded workspace scan before a run and another at its end; this is the
  price of supporting non-Git workspaces and tools whose outputs contain no diff.
