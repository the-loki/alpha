# The queue belongs to the workbench, not to the lane

Messages typed while the agent is working wait in a queue the workbench owns: a list of pending
texts in the main process, per conversation, sent one at a time as each turn ends. The runtime's
own queue keeps only *steering* — the messages that are meant to land inside the turn already
running. Two words, two mechanisms, and the reason is that only one of them can be edited.

## Superseded in part

Four details of the mechanism have moved on; the decision itself is what stands.

The steered half is **a workbench list** now, not the translation layer's. The translator's branch
that turned a `queue_update` event into steer rows was fed by nothing — Alpha assembles pi's
`Agent`, and that event belongs to the harness lane, which Alpha does not use — so what a running
turn was steered with is kept beside the queued messages, in `QueueRunner`, which is the one place
`queue_updated` is emitted from.

A steered message is **a message of the conversation** once the lane takes it. pi hands the
run every message it is given — the prompt's own and a steering message alike — as a message of the
run, with `message_start`, and nothing else is emitted at that moment. Alpha translates that into
the window's `user_message` and writes the entry to the session, so what a person steered with is
in the conversation from then on: the strip shows what has *not* been taken yet, and the transcript
is where a taken steer lives. Before this, the translated event had one producer — the prompt
itself, which announced and wrote its own message — so a steer was drawn on the strip and nowhere
else, and because no entry was written for it, reopening the conversation lost it.

The lane's drain mode defaults to **`one-at-a-time`**, not `all` as the Context below says: Alpha
sets no `steeringMode`, and pi's `PendingMessageQueue` defaults to one. A run therefore takes one
steered message per turn boundary, and a second steer sent before the first is taken is really
still waiting — which is why the strip lists both.

The **"too late" answer was never built**. The contract's only cancel is
`cancelQueued(conversationId, entryId)`, which answers nothing. Cancel removes that one waiting
steer by ID. Pi can clear its steering queue only as a group, so Alpha synchronously clears and
requeues the other steers in their original order; an ID already taken changes nothing. A steer is
listed until the lane takes it, the user cancels it, or the turn ends.

## Context

The runtime underneath (pi's lane) already has a queue: `steer()` puts a message into the running
turn at its next checkpoint, `followUp()` puts one behind the turn. We used `followUp` for the
composer's Queue button and `steer` for its Steer button, and the window showed the follow-ups
with a Cancel on each.

Then the request arrived: queued messages must be **editable**. The lane cannot do that. Its queue
is append-only — an entry's payload is written once at enqueue and only ever deleted; the inbox is
an array that drains in order; the interface has four methods and none of them edit, reorder or
prioritise. "Edit" can only be cancel-and-re-enqueue, which silently moves the edited message to
the back of the queue — a reordering the user did not ask for and cannot see.

Two smaller facts pushed the same way. The lane's queue is drained according to a mode that
defaults to `all`: everything waiting goes into the turn at once. And an interrupted run discards
its queued steers and follow-ups — the workbench aborts whatever was in flight at startup, so
anything queued when the process dies is gone anyway.

## Decision

**A queued message is the workbench's, and it is sent as the next turn.**

The main process holds, per conversation, an ordered list of texts waiting to be sent. When a turn
ends normally, the head of that list becomes a new turn — one at a time, never all at once. The
list is main-process state, so it survives a window reload and a browser client reconnecting, and
it belongs to the conversation, so switching conversations and coming back finds it as it was.

**A steered message is handed to the running agent, and it lands inside the turn.**

Steering is the one thing the runtime can do that the workbench cannot fake: inject a message into
the turn already running. `QueueRunner` lists a steer until the agent takes it; it cannot be edited,
and its only action while waiting is Cancel.
The design had the runtime answer honestly when it is too late (`already_consumed`); the Superseded
section above records that this answer was never built.

**The queue pauses rather than pressing on.** A failed turn and a user pressing Stop both leave
the remaining messages where they are and stop sending; a single Resume starts them again. A
failure usually means the environment is wrong (no model, expired credentials), and firing the
rest of the queue into the same wall hides that. Stop means stop.

**The queue does not outlive the process.** Quitting the workbench empties it. A queue that
survived a restart would need an account of why nothing was sent and whether to belatedly send it
now, which contradicts [ADR-0008](0008-a-run-nobody-is-driving-is-over.md): a run nobody is
driving is over. The mitigation is visibility, not durability — the queue sits above the composer
while the window is open, so what a quit would drop is exactly what can be seen.

## Consequences

- The agent's `followUp` is not used; the workbench's own queue keeps follow-up messages, while
  `QueueRunner` tracks steers until the agent takes them. A taken steer is a message of the
  conversation like any other.
- "Queued" means "will start a turn of its own", not "will join this turn". A user who wants a
  message inside the current turn has Steer for it, and the queue strip labels which is which.
- Editing is in place and does not move the message. Reordering is not offered: the order is the
  order they were typed, and the way to move one is to delete it and type it again.
- The queue's persistence question is settled in the negative, which is a decision about a place
  to write (`queue.json` beside the transcript) that was considered and declined.
- Long queues are capped by nothing; the strip scrolls instead, because an invented number would
  still need a rule explaining itself.
