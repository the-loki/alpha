# A run nobody is driving is over

A run belongs to the process that started it. If that process is killed while a turn is streaming,
nothing is driving that turn any more, and the conversation is over as far as the workbench is
concerned: opening it finds no run in flight, and it can be edited, regenerated or continued
straight away.

## Superseded in part

The mechanism this was decided against is gone, and it is worth saying which half that leaves.
Driving a `pi` the person installed, the *session* carried the run's state: a killed process left
the last operation saying `running`, the lane adopted it as current when the session was opened,
and opening therefore meant settling it — aborting it — before the window could ask for anything,
because the agent refuses to navigate a branch while an operation is current.
[ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md) moved the store into Alpha
and the run into a method call, so a run's "is it happening" is now a promise the runtime holds:
`ConversationRuntime.isRunning()` is `driving !== undefined`, and a process that dies takes it with
it. There is no operation record to settle on open. The decision below is what stands, and it is
now a property of the design rather than a step somebody has to remember.

## Context

A turn lives in the runtime, and what it produced lives on disk with the session. Explicitly
closing an open conversation through `ConversationRuntime.close()` stops a run in flight first, so
the run ends the way a Stop does. Closing the window alone does not do this on macOS, where the
process remains alive. A process killed with the run in flight leaves the opposite: work stopped
mid-sentence, with no one left to finish it.

Before the runtime answered for itself, the window refused earlier and louder: a run's state was
read back from disk and never cleared, so an edit was refused for good. That is the failure this
decision names — a projection of a run outliving the process that was running it.

The alternative was to leave the run alone and let it be resumed. That was measured while the
operation state still existed, not assumed: the pending assistant frame was written out as an
interrupted message and nothing further was emitted for the run, so there was nothing to resume —
an interrupted run is a record of work that stopped, not work waiting to continue.

## Decision

A run nobody is driving is over, and no record of it may outlive the process that was driving it: a
run in flight is state this process holds, and what the store keeps is what the run *produced*.
Opening a conversation has no operation to settle, because nothing on disk carries one, and nothing
about a dead run can refuse an edit or a regenerate.

`ConversationRuntime.isRunning()` answers "is a turn in flight" from the state this process is
running, not from anything on disk: the store cannot tell a run it is driving from one that died,
so only the process that started a run may speak for it.

## Consequences

- After a crash the turn is over, and the conversation holds what the run had produced by its last
  finished message. An entry is written when a message ends, so text still streaming when the
  process died was never written and is not kept half-formed.
- A run stopped on purpose — Stop, or explicitly closing its runtime — is the other case: it keeps
  what had arrived, because the message is persisted as `interrupted` and reads back that way.
- Edits and regenerates are refused only while this process is actually running a turn.
- A conversation whose turn was killed can be edited, regenerated, or continued as soon as it is
  opened again.
