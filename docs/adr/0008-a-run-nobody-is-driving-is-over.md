# A run nobody is driving is over

When a conversation's session is opened, an operation that was left unsettled by a previous
process — the window was killed while a turn was streaming — is settled before the window can ask
for anything. pi keeps that operation as the lane's current one and refuses to navigate while
anything is current, so without this the conversation could be read but never edited or
regenerated again.

## Context

A turn lives in the lane, and its state lives on disk with the session. Closing the window
gracefully is not a crash: `ConversationRuntime.close()` stops a run that is in flight first, so
the operation settles and the next launch finds nothing outstanding.

A process killed with the run in flight leaves the opposite: the session's last operation state
says `running`, and the lane adopts it as current when the session is opened. Nothing is driving
it — the process that was is gone — and pi will not navigate the branch while an operation is
current, so `resend` and `regenerate` fail with "already has an active operation". Before the
runtime answered for itself, the window refused earlier and louder: the conversation index's
`status: "running"` was read back from disk and never cleared, so the edit was refused for good.

The alternative was to leave the operation alone and let it be resumed. pi has a `resume` path for
durable runs, and reopening could have re-driven the model to finish the interrupted answer. That
was measured, not assumed: pi writes the pending assistant frame out as an interrupted message and
emits nothing further for the run, so there is nothing to resume — the operation is a record of
work that stopped, not work waiting to continue.

## Decision

Opening a session settles an unsettled operation by aborting it. The interrupted answer stays in
the transcript as `interrupted`, with the text that had arrived, and the conversation is
immediately editable.

`ConversationRuntime.isRunning()` answers "is a turn in flight" from the events this process is
running, not from the lane's record: the lane cannot tell an operation it is driving from one that
died, and the window's `status` is a projection that outlives the process that wrote it.

## Consequences

- After a crash, the turn is over. The part of the answer that had arrived is kept; the rest is
  not silently spent on the user's behalf.
- Edits and regenerates are refused only while this process is actually running a turn.
- A conversation whose turn was killed can be edited, regenerated, or continued as soon as it is
  opened again.
