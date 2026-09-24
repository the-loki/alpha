# The agent is embedded, and the workbench is the base

Alpha stops driving a `pi` the person installed and embeds the agent instead: the conversation
runs on `@earendil-works/pi-agent-core` inside the main process, everything coding-agent used to
provide around that core is either adopted from the library or rebuilt by Alpha with
coding-agent's own design as the reference, and the features Alpha hangs on the agent are plugins
on a base of Alpha's own rather than extensions in somebody else's format. This supersedes the
child-process half of [ADR-0001](0001-agent-runtime-in-main-process.md) — the runtime still lives
in `main`, but it no longer leaves the process — and retires the RPC era
([docs/research/pi-coding-agent.md](../research/pi-coding-agent.md) records it as history).

## Context

Alpha spoke RPC to a `pi` binary because that kept Alpha out of the agent business: no package
depended on a pi package, nothing parsed a session file or spoke a provider's wire, and the
person's `pi` stayed the person's. The costs of that distance grew with the workbench:

- **A gate across a pipe.** The permission gate was an extension Alpha wrote into a directory and
  the agent read back — a `tool_call` hook that turned every call into a stringly `input` dialog
  on the same pipes, with Alpha parsing its own question out of a JSON placeholder. The ladder
  lived in Alpha and the asking lived in a file Alpha rewrote on every start.
- **A model catalog at arm's length.** Alpha held the providers and the encrypted keys, then
  described them to the agent twice — a `models.json` naming `$VARIABLES`, and the variables
  themselves in a child's environment. The agent re-derived what Alpha already knew.
- **A session Alpha could only read through the agent.** Reading a resting conversation meant
  spawning a short-lived `pi` to ask it for its own file. Deleting one meant the same.
- **A moving protocol.** RPC framing, command and event vocabulary, the extension-UI sub-protocol:
  all the agent's, versioned by the agent, pinned by a research document that had to be re-checked
  per release.

pi-agent-core already holds the parts of that relationship that were never the CLI's: the `Agent`
loop (prompt, steer, abort, streaming events, a `beforeToolCall` that can block — the gate's
actual hook), the four tools over an `ExecutionEnv` abstraction, the compaction math, and
pi-ai's provider layer with per-request auth resolution. coding-agent itself is a thin shell over
the same core — its `AgentSession` is the reference for the glue, and it does not use core's
heavier harness layer.

## Decision

**The agent runs in `main`, on the core.** One embedded agent per open conversation. A prompt is a
method call and an event subscription; there is no framing, no correlation ids, no child to
reap. The wall of constraints moves accordingly: C2.0 forbids pi imports everywhere except `main`
and the capability packages the checker lists by name — `@alpha/agent`, the mechanism half of the
base, and `@alpha/internal-plugins`, whose faces are where pi's own shape is the capability — while
the renderer and every other library keep the ban, the contract still their only door. C2.4's key
path ends at the model runtime's auth resolver instead of a child's environment.

**The workbench is the plugin base.** Alpha defines the contract its agent is assembled from: a
plugin contributes tools and two hooks — `beforeToolCall`, which chains across plugins and any of
which may block, and `afterRun`, which sees how the run ended. One host per open conversation
composes them into the `Agent`, rejects duplicate tool names, refreshes tools when a plugin's list
changes, and releases subscriptions when the conversation closes. The MCP hub remains shared by
the workbench; the MCP plugin subscribes through its conversation's host. The contract is Alpha's
own, not a re-implementation of coding-agent's extension
loader: no jiti, no external files, no `pi.registerCommand` surface. Built-ins ship as the first
plugins, so the base is exercised by everything Alpha itself needs:

- **workspace tools** — core's `read`/`bash`/`edit`/`write` over a `NodeExecutionEnv` rooted at the
  conversation's workspace;
- **the gate** — the same ladder and approval broker as before, now as a `beforeToolCall` plugin
  whose block becomes the tool result the model reads, in Alpha's words, with no extension file
  and no stringly protocol between the decision and the block;
- **compaction** — core's `shouldCompact`/`generateSummaryWithUsage` with coding-agent's policy
  shape (reserve and keep-recent tokens), applied to the live transcript, written as a compaction
  entry;
- **auto-retry** — coding-agent's design: a transient provider failure after `agent_end` retries
  with backoff, and the decision is published as `shouldRetry` so the translator keeps the turn
  open while an attempt is planned. The base announces each actual retry before continuing the
  agent, so the runtime can move the session path past that failed attempt. Automatic compaction
  waits for a successful run instead of summarizing an attempt about to be discarded. The live
  transcript removes a discarded assistant message when the retry actually starts; the usage of
  each attempted assistant message is still counted.

The workbench keeps a turn running through its `afterRun` hooks, including automatic compaction.
It emits `turn_finished` only after those hooks settle, so Stop can cancel a summary request and a
queued message cannot start before the current turn has finished its session work.

**Alpha owns the session store again.** The transcript of record is an append-only JSONL of
entries — the same entry shapes (message / compaction / branch summary, `id`/`parentId` tree) the
RPC reader already parsed — written live as the run produces them, in Alpha's data directory,
under the naming the index already tracks. A pi-written v3 file is read in place by the same
parser, so every conversation that exists keeps opening; only new writes are Alpha's. Forking is a
copy of the tip path into a new file, which is what `pi --fork` did on Alpha's behalf.

**The model runtime is Alpha's, in memory.** `createModels()` plus one provider per configured
entry, built through pi-ai's `createProvider` with the wire protocol Alpha already stores, the
base URL Alpha already stores, and an auth resolver that answers from the vault at request time.
No `models.json`, no env vars, no catalog files.

An open conversation is assembled against the provider definitions current when it opens. When
those definitions change, the manager waits for any active turn to settle and reassembles before
the next prompt. Credentials are resolved at request time and do not require reassembly. The
chosen model must be served by that runtime; another available model is never substituted for it.

## Consequences

Alpha ships the agent it runs, so Alpha's release carries the library's bugs and fixes alike —
pinned as a dependency, upgraded deliberately, the way every other dependency is carried. The
Agent settings page and its install/locate flow are gone: there is nothing to look for. The
scripted agent of the test suite retires with the RPC client it imitated; the e2e seam becomes a
scripted provider on loopback, which is closer to the truth now that the wiring Alpha owns ends at
the provider's wire. What coding-agent still does better — its TUI, its skills, its resource
loaders, its session CLI — stays where it is: outside Alpha, and no longer Alpha's problem.
