# An MCP server is reached, not loaded in

A workbench may be configured with **MCP servers** — programs it starts, and endpoints it posts to —
and the tools those servers offer become the agent's tools: gated, approved and shown exactly like
the four Alpha ships. Alpha speaks the protocol itself, over stdio and over HTTP, and nothing of a
server's runs inside Alpha's process.

## Context

An agent with four tools is an agent with four tools. Reading and writing files, editing them and
running a command is a working set, and it is also the whole set: a database, an issue tracker, a
design tool, a browser — anything else a person's work needs — had no way in short of a code change
in this repository.

The ecosystem's answer is MCP: a server offers tools over a small protocol, in its own process or at
its own URL, and the client's side of it is a handshake, a list and a call. The cut in
[C3.7](../constraints/03-product-scope.md) — no extension API for other people's code, no
user-authored tools — was written against a surface Alpha would have to keep stable and a loader
that would run a stranger's code in its own process. A protocol is neither: what a server does, it
does where it already runs, and Alpha's part is a client.

The other half of the context is what Alpha already has. A tool is a face on the plugin base
([C2.8](../constraints/02-architecture.md), [ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md));
a call is decided by the ladder ([ADR-0002](0002-four-level-permission-ladder.md)); a row in the
transcript is read from the result
([ADR-0004](0004-transcripts-as-jsonl-entries.md)). A server's tools need all three and change none
of them.

## Decision

**A server is reached, never loaded.** stdio means a child process Alpha starts with its own
environment; HTTP means one POST per message, answered with a JSON body or a stream of events. The
configuration is `mcp.json` in the data directory, read as far as it goes: no file is no servers, an
entry that names neither a command nor a URL is left out, a file that is not JSON is not a reason for
the agent to fail to start, and a server that cannot be reached — no such command, a refusal, an
endpoint that never answers within the connect timeout — is left out while the others still work.

**The client is Alpha's own, and small.** `@alpha/mcp` holds it: the request bookkeeping, the
handshake, the list, the two transports, and the servers file. No SDK is taken on. Every part that
decides anything — which tools exist, whether a call may run, how a result reads — is Alpha's
already, and the protocol is a handful of messages; a dependency would add a second vocabulary for
the same few moves. It is an ordinary library: no Electron, no pi, and nothing of the agent in it.

**One hub per workbench run.** `main` connects the configured servers at boot and holds them;
`openRuntime` awaits that one connection and hands the tools to the assembly; `quit` closes it. Per
conversation would have been the obvious wiring — `pluginsFor` is where a capability is registered —
and it is the wrong lifetime: a conversation is opened and closed as a person moves around the
window, and a server is a child process or an endpoint that must not be started again for each one.

**A server's tool is a tool.** No new face is added to the base for them. The name the model sees
carries the server (`mcp__<server>__<tool>`), because two servers may each offer a `read` and the
model has to reach the one it means; the parameters are the server's JSON Schema, taken as the shape
it promised; calls run one at a time, because a server may not answer two at once; the `AbortSignal`
a stop travels on is forwarded, and a cancelled request is announced to the server as the protocol
asks. Whether a call may run is the ladder's answer and nothing else's — an MCP tool name is a name
no rule knows, and `toolRiskOf` reads an unknown name as the strictest class — which is why
approvals, the tool rows and the transcript needed no code for this at all.

**No per-server "allowed by default".** A definition says how to reach a server and nothing about
what may run: a grant is the ladder's, or a rule the person made at the approval card
([C3.4](../constraints/03-product-scope.md)). A second place where "yes" could be said would be a
second place to audit and a way to say yes without ever being asked.

## Consequences

- The tools a workbench has depend on a file it does not manage. `mcp.json` is edited by hand
  because nothing adds a server from the window yet; a settings panel is the natural next step, and
  it is a panel, not a new mechanism.
- What a server's tool call costs is not visible in Alpha's usage totals: a server may spend its own
  tokens, and its result arrives as text like any other tool's output. The number stayed honest by
  staying what it was.
- A conversation assembled before the servers came up still reaches them — the assembly waits for the
  one connection — so a slow server costs the first conversation its first moment, once, instead of
  costing every conversation a second copy of itself.
- A server's tool list is not fixed. When it says the list changed — the one notification the client
  acts on (#184) — the hub re-reads it, and a conversation that is already open is brought up to
  date: the plugin replaces its own half of the live agent's tools and pi announces the difference
  to the model before the next request. The other notifications are read and dropped, because there
  is nothing here they belong to (`progress` is for calls we never gave a token, `message` is a log
  with no log, `cancelled` cancels requests we did not send). Server-pushed *requests* — sampling,
  elicitation — are still the second face this ADR left alone: they need a hook pointing inward,
  and the decisions that come with it (#185).
