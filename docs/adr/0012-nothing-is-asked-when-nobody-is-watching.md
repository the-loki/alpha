# Nothing is asked when nobody is watching

A run the workbench starts on a schedule has no one to answer an approval card, so a call that
would ask is **denied immediately** instead — with a reason written for the model to read. The
four-level ladder is unchanged for runs a person is driving, where a card still waits as long as it
takes.

## Context

[ADR-0002](0002-four-level-permission-ladder.md) puts a gate in front of every tool call, and the
ladder's middle is a question: `ask` asks about every write and every command, `accept-edits`
auto-approves file changes but still asks about commands. The gate puts the card in the window and
awaits the answer; the promise it holds has no timer, because a person is assumed to be there.

A scheduled run breaks that assumption. The window may be open on another conversation, or on
nothing; the card lands in a transcript nobody is reading, and the run sits there — for hours, or
until someone notices. There is no timeout to save it, and there should not be one for attended
runs: a user who walks away from a question and comes back an hour later has lost nothing.

The workbench already has a rule for runs nobody is driving:
[ADR-0008](0008-a-run-nobody-is-driving-is-over.md) ends a crashed run rather than waiting for a
process that is gone to resume it. This is the same situation caught earlier — the run is alive but
its question is not going to be answered — and it needs an answer that is decided before the run
starts rather than discovered at 3am.

## Decision

**An unattended run turns every question into a refusal, at once.**

When the gate would ask during a run the scheduler started, it does not ask: it denies the call
with a reason written for the agent — *no one is watching this run; the call needed approval and
was refused* — and the turn continues. A denial is already a tool result the model reads and adapts
to (that is how `plan` teaches an agent to propose instead of act), so the turn ends normally with
an account of what it could not do, instead of hanging.

**Waiting and timing out were considered and rejected.** A timeout defers the same refusal by an
interval nobody can choose well, and buys a run that idles holding a session. If the answer is
going to be "no", saying it immediately is the only version of the answer that is not a lie about
someone being there.

**Unattendedness belongs to the run, not to the conversation.** The scheduler marks the runs it
starts. A person who opens a scheduled task's conversation later and types a message is driving it,
and everything behaves exactly as it always did: cards wait, and no call is refused on the grounds
that nobody is watching.

**The level is the task's own.** A new task starts at `ask`, independently of the workspace's
default, and its level can be changed explicitly when the task is edited. Changing the workspace
default never silently changes what an existing task is allowed to do overnight. All four levels
are available to a task — none is forbidden — because the level a task needs is a property of the
work, and `plan` is not a
substitute for `ask` (it also tells the agent to propose rather than act, which is a different
instruction, not a stricter one).

**The consequence is stated where the choice is made.** Creating a task at `ask` or `accept-edits`
says plainly that steps needing approval will be refused while the run is unattended; creating one
at `full-access` says plainly that it will do anything while no one is watching. This is not a
checkbox to click past: the sentence is the documentation of the combination, and the task list
shows the level beside the task so it stays visible.

## Consequences

- A task whose work needs a command without a matching remembered rule needs `full-access`;
  `accept-edits` auto-approves edits only, so a "change something and run the tests" task may be
  refused at the test step. The creation sentence makes that predictable.
- Every refusal is visible twice: as a denied row in the transcript (with the unattended reason)
  and as a count in the task's own history, so a task that "didn't do anything" explains itself.
- The refusal reason is agent-facing prose (ADR-0010), not a translated label: the model reads it.
- `ApprovalBroker` gains no timer. Attended runs keep waiting indefinitely, which remains the
  intended behaviour and the reason no timeout was added anywhere.
- "Run now" starts an attended run and opens its conversation as soon as it exists, so a card that
  asks for approval is visible to the person who started it.
