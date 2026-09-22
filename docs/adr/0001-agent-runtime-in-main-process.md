# The agent runs in the main process, as the person's own `pi`

Alpha runs the agent in the Electron main process. It is the `pi` the person installed, started as
a child process and spoken to over its RPC protocol; the renderer stays a pure view fed by IPC
events.

## Superseded in part

This decision was first written the other way up: the agent *was* a library Alpha embedded
(`@earendil-works/pi-agent-core`'s `AgentHarness`), and Alpha owned the loop, the tools, the
session store and the model client that went with it. That build is gone. What stands is where the
agent runs — the main process — and why: credentials and filesystem access stay out of the web
context, and the renderer reaches the agent only through the IPC contract.

[ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md) retired the child-process
half described below: the agent is a library Alpha embeds again, in the same main process. The half
that stands is the process; the `pi` on the person's machine is no longer party to it.

## Context

Two shapes were available once Alpha stopped embedding an agent. Ship one (a package Alpha
updates), or drive the one the person has (`pi`, installed the way they install anything else).
Shipping one means owning a distribution, a version skew against the person's own pi, and every
security fix in between. Driving theirs means Alpha ships no agent at all: it finds `pi`, says so
when it is missing, and can install it if asked ([#109]).

## Considered options

- **Embed an agent library** (what this used to be). Full control of the loop, and a large
  surface Alpha then owns: model registry, wire protocols, tool implementations, session store,
  loop, and their versions.
- **Drive the person's `pi` over RPC** (chosen). One child process per conversation, JSONL
  records down its stdin and up its stdout, and an extension Alpha writes for the one thing that
  must be Alpha's: the permission gate.

## Consequences

- Alpha owns: the window, the IPC contract, the conversation list and titles, the permission
  ladder and its decisions, the credential store, and the transcript it *reads back*.
- The agent owns: the run loop, the tools, the session file, the model client, compaction, and
  the branch tree.
- Anything Alpha wants the agent to do differently is an extension or a flag, not a patch: the
  gate is an extension Alpha writes into its own agent directory
  ([ADR-0002](0002-four-level-permission-ladder.md)).
- A machine with no `pi` has a workbench that cannot run a conversation, which is a state the
  window says out loud rather than a crash ([#109]).
- The RPC protocol is the seam every test stands on: the suites drive a scripted agent that
  speaks it (`tools/scripted-agent/`), and the things that cannot be faked — the gate's round
  trip, a provider's reachability — are checked against a real `pi` when one is installed.

[#109]: https://github.com/the-loki/alpha/issues/109
