# The gate's decisions live in Alpha's own file, beside the session

A tool call's approval decision — that the ladder allowed it automatically, a remembered rule
matched, the user allowed it once, or the user denied it — is persisted per conversation in
`decisions/<conversationId>.json` under the workbench's data directory, and merged back into the
transcript when it is read from the session.

## Context

ADR-0004 makes the session the record of the transcript, and its entries carry the tool call, its
arguments, its result and its timing — everything the runtime observed. They do not carry the
decision, because the decision is not the transcript's: it is made by Alpha's gate, from Alpha's
permission level, Alpha's remembered rules, and the user's answer to a card the run never records.
When this was written the session was another program's file, which made the separation sharper;
Alpha writes it now ([ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md)), and
the reasons below still hold — a transcript is what happened, and the note is what Alpha decided
about it.

The ledger's whole value is auditability: a row says what ran *and why nothing stopped it*. When
the window reads a transcript back after a relaunch, that second half has to still be there. The
first version dropped it, so the same row read differently live and restored — the review caught
it, and the visual gate caught it again from the screenshots.

## Considered options

- **Write the decision into the session as a custom entry.** The format carries such entries, but a
  transcript that holds Alpha's provenance makes one session mean something different to every
  other reader of the same format, and a decision is not evidence of what happened.
- **Reconstruct the decision on read.** Impossible in the general case: "allowed automatically at
  full access" and "allowed once by the user" are indistinguishable from the entry alone, and
  getting that wrong is worse than saying nothing.
- **A file per conversation, written by Alpha** (chosen). One small JSON object keyed by call id,
  written as each decision is made, read when the transcript is read, deleted with the
  conversation. The session stays a transcript; the note stays beside it.

## Consequences

- Deleting a conversation deletes its decision log, and the E2E for that asserts the file is gone.
- A decision that cannot be written is dropped rather than raised: the gate calls this while a
  tool call is waiting on it, and a missing note costs a line in the ledger, not a turn.
- The log is keyed by call id, so a forked conversation inherits the notes of the calls it copied.
- The decision survives a relaunch, not a deleted file — a user who removes `decisions/` loses the
  provenance line and keeps the transcript. That is the intended order of importance.
- The log hands out a ledger per conversation rather than a bare map, and the conversation's id is
  bound when it is opened. The id is minted before the session exists, so the file a note lands in
  is decided once — a new gate path cannot write a decision to the wrong conversation's file.
