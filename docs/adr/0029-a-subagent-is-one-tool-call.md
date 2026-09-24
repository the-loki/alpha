# A subagent is one tool call, and its work stays out of the conversation

The agent can hand one task to a **subagent** — a second agent it runs for the length of that call —
through a `task` tool. The subagent is assembled from the caller's own plugins, given one
instruction, and answers with one message. Its model usage counts in the caller's conversation;
its messages stay private. Two are shipped, and the registry that names them is
`@alpha/subagents`, policy with no agent in it.

## Context

A long job spends the conversation it was asked in. Every file the agent reads to find something
stays in its context for the rest of the conversation, and so does every dead end on the way: the
work is worth doing and not worth keeping. Handing it to something that runs beside the conversation
is the ordinary answer, and it needs nothing new from Alpha's side — a tool whose call runs an agent
is a tool call, and the plugin base is what Alpha assembles agents from.

Two cuts stood in the way, and both are narrowed here rather than dropped
([C3.7](../constraints/03-product-scope.md)): no multi-agent orchestration and no sub-agent spawning
from the UI. What this is not: a graph of agents, a scheduler, parallel work, or agents talking to
each other. It is one delegation inside one tool call, which is why it can arrive as one plugin.

## Decision

**One tool, `task`, and the child is an `assembleAgent`.** The face is
`@alpha/internal-plugins/src/subagents-plugin.ts` — the package allowed to name the agent library
(C2.0) — and the registry behind it (`@alpha/subagents`) names nothing of pi: a name, a description,
a standing instruction, the tools it may use, and the turns it gets. The child is assembled from the
caller's plugins twice filtered: it gets the tools its definition lists, and **every
`beforeToolCall` the caller is under**. That second half is not an option to be remembered —
the ladder *is* a `beforeToolCall` hook, so taking the whole chain is what makes a subagent's calls
gated automatically. Nothing else comes along: a plugin's `afterRun` half belongs to the
conversation that is running (compaction rewrites *that* agent's history, auto-retry spends *that*
conversation's attempts), and a subagent is not that conversation.

**A budget, because a subagent has no person watching it.** `shouldStopAfterTurn` — pi's own option,
passed through `assembleAgent` — is what ends a run that would keep going: the registry's `maxTurns`
is the number of turns before the child must answer. A child that is stopped with half an answer
fails the tool call with what it had and why, rather than pretending the delegation succeeded; the
model reads both, and so does the row. A complete answer on the final allowed turn succeeds; only
an unfinished tool step or truncated answer at the limit is reported as spent.

**No recursion, by the shape of the registry.** A definition lists tools out of the caller's own, and
none lists `task`: a subagent cannot hand work to a subagent. That is a property of the policy, not a
check in the face, and `allowsTool` is where it is stated.

**One row, and a memory-only transcript.** The subagent's messages are its own and are dropped with
it: none appears in the parent's transcript, which shows only the `task` row, its instruction and
answer. The child's model usage is the exception: one `subagent_usage` entry on the parent's active
session path records its tokens and cost, even when the tool fails or is stopped. The runtime also
emits `usage_recorded`, so the live total and reopened total agree. What the window therefore hears
about a subagent's own call is a decision it has no row for: the gate's port is the parent
conversation's, so a subagent's approval card and its
`tool_decided` both arrive for the parent. The card is right (it is the person's call to allow, and
it says what would run); the decision finds no row, and the reducer already ignores a call it cannot
place. The ledger beside the parent's session keeps the record either way, because a real call was
really decided.

## Consequences

- A subagent's tokens and cost count in the parent conversation's totals, while its messages remain
  private. The usage entry stays on the session's active path through compaction and is excluded
  when an earlier branch is chosen. A failed parent turn closes its spending row just as a successful
  turn does, so the total does not change merely because the conversation was reopened.
- A subagent's turns are not on screen. The person sees the task, its approval, and the answer, and
  nothing of the reading in between: the same trade as the context it does not spend. A window that
  wanted to show it would need the child's transcript kept, which is a decision with a lifetime — where
  it is written, when it is swept — and not a display detail.
- MCP tools are not in a subagent's set. A definition's `tools` names the built-in ones, and an MCP
  tool's name carries its server (`mcp__<server>__<tool>`); a registry that wants to hand one over
  says so in that name. Nothing here reaches into the MCP hub for it, because the tool list is what
  the registry says and not what the run happens to hold.
- Two are shipped — `explore`, which cannot write, and `builder`, which does what the caller can.
  They are code rather than a file because nothing edits one: a panel that let a person write a
  subagent would be the reason to move the registry into the data directory, and there is no panel.
