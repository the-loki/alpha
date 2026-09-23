# The agent runs in the main process

Alpha runs the agent in the Electron main process, and the renderer stays a pure view fed by IPC
events. What this decision protects is where the agent runs, and why: credentials and filesystem
access stay out of the web context, and the renderer reaches the agent only through the IPC
contract.

## Superseded in part

The title read "…as the person's own `pi`" for as long as the second half stood: a `pi` the person
installed, started as a child process and spoken to over its RPC protocol. That build is gone.
[ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md) retired it and the agent
is a library Alpha embeds again, in this same main process: neither the `pi` on the person's
machine nor the RPC client that spoke to it is party to anything Alpha does now.

An earlier version of the decision was written the other way up as well: the agent *was* a library
Alpha embedded (`@earendil-works/pi-agent-core`'s `AgentHarness`), and Alpha owned the loop, the
tools, the session store and the model client that went with it. The half that stands through both
reversals is the process.

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
  ladder and its decisions, the credential store, and the session store the transcript is read
  from ([ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md)).
- The agent library owns the run loop, the model client and the compaction math; Alpha builds the
  tools, the gate, the retry policy and the store on top of it as plugins.
- Anything Alpha wants the agent to do differently is a plugin on Alpha's own base and never a
  patch to the library — the gate is one
  ([ADR-0002](0002-four-level-permission-ladder.md), ADR-0025).
- There is nothing to find, install or keep alive. A machine with no `pi` runs conversations, and
  the state the child-process build had to announce — a workbench that cannot run without it — is
  gone with the child.
- The provider's wire is the seam every test stands on: the suites point the app at a scripted
  endpoint on loopback (`e2e/scripted-provider.ts`), and what a stand-in cannot answer — a real
  provider's reachability, and a real model deciding to call a tool — is checked by the live spec
  when the environment names a provider
  ([ADR-0022](0022-a-live-run-may-reach-a-provider.md)).

[#109]: https://github.com/the-loki/alpha/issues/109
