# 02 — Architecture

## C2.0 — The agent is a program Alpha runs, not a library Alpha links

Alpha ships **no agent**. A conversation is a child process — the `pi` the person installed, found
through Settings and driven over its RPC protocol ([ADR-0001](../adr/0001-agent-runtime-in-main-process.md)).
No package depends on a pi package, and nothing under `packages/*/src` parses a session file,
speaks a provider's wire, or implements a tool. What Alpha keeps of its own is the gate it writes
as an extension, the `models.json` it writes for the agent to read, the conversation list, and the
credentials.

**Enforcement:** `pnpm check:constraints` rule `02-architecture:no-agent-dependency` fails on an
import of a `@earendil-works/*` package (or a `pi-agent-core`/`pi-ai` name) anywhere under
`packages/*/src`. The install command Alpha offers is a string, not an import, and is exempt by
being a string.

## C2.1 — Four packages, one direction

```
renderer  ──┐
            ├──> core        (pure TypeScript: domain rules, contracts, no I/O, no Electron)
preload   ──┤
            └──> (nothing else)
main ──────────> core
```

| Package | Holds | May import |
| --- | --- | --- |
| `@alpha/core` | Domain rules, IPC contract types, validation schemas | nothing from this repo |
| `@alpha/main` | Electron main process, the agent runtime, storage | `core`, node, electron |
| `@alpha/preload` | The contextBridge surface | `core` only |
| `@alpha/renderer` | React UI, router, stores, styles | `core` only |

Dependencies never point backwards: `core` knows nothing about the other three, and no package
imports `main`. A cycle between packages is an error.

**Enforcement:** `pnpm check:constraints` rule `02-architecture:core-stays-pure` fails on any
`electron` or Node builtin import under `packages/core/src`, and Biome's `style/noRestrictedGlobals`
keeps the renderer off `process`, `require`, and `Buffer`.

## C2.2 — The renderer talks to the main process through one contract

All cross-process traffic is declared once, as types plus channel names, in `core`'s contract
module. The renderer never touches `ipcRenderer`; it calls the typed client the preload exposes
on `window`. The main process registers one handler per contract channel and no others.

Adding a capability means adding it to the contract first. A handler with no contract entry is
dead code the checker will find.

**Enforcement:** `pnpm check:constraints` rule `02-architecture:contract-channels`. It reads the
three sides at once and fails when a channel string is written out by hand instead of taken from
the contract module, when the window calls a channel nothing in `main` handles, or when it listens
for an event nothing sends. It also fails on `ipcMain`/`ipcRenderer`/`contextBridge` in code
anywhere outside the two seam files — a comment may name the transport, code may not, and an import
counts as code — and on the renderer so much as naming the transport.

## C2.3 — The agent runtime lives in `main`

`pi-agent-core` runs in the main process. The renderer is a view: it renders events, sends
intents, and holds no model client, no API key, and no transcript of record. The renderer's copy
of a conversation is a projection that can be rebuilt from the runtime at any time.

**Enforcement:** two rules, because they catch different things: Biome
`style/noRestrictedImports` (scoped to `packages/renderer/src`) fails on an agent-package import
at lint time, and `pnpm check:constraints` rule `02-architecture:renderer-has-no-model-client`
catches it in the same scan that checks everything else.

## C2.4 — A key goes from the vault to the agent's environment, and nowhere else

A credential is read from encrypted storage inside `main` and handed to the agent as an
environment variable named for one provider, for one conversation. It never crosses the IPC
boundary in plaintext: the renderer may learn *that* a credential exists, and may send a new one
*to* be stored, never read one back. Nor is it written into a file — the agent's `models.json`
names the variable, and the key itself travels only in the environment of the process that dials.

**Enforcement:** `pnpm check:constraints` fails if any renderer file reads a field whose name
matches `/apiKey|secret|credential/i` off a provider payload; review covers the rest.

## C2.5 — Size budgets

| Thing | Limit |
| --- | --- |
| Function or method body | 60 lines |
| React component body | 120 lines |
| File | 300 lines |
| `useEffect` in one component | 2 |

When a file wants to exceed these, the usual correct answer is that it is two modules wearing one
hat; the constraint exists to make that visible at the moment it happens rather than at review
time.

**Enforcement:** `pnpm check:constraints` rules `02-architecture:max-file-lines` and
`02-architecture:max-function-lines`, both covered by tests over source strings that must pass
and must fail.

## C2.6 — The runtime owns the transcript, the store owns the view

There are exactly two copies of a conversation in memory: the runtime's message array (the
source of truth) and the renderer's store (a projection updated from events). The store never
edits a message the runtime produced; the runtime never reads the store.

This is what makes resume, replay, and compaction tractable: the transcript is one ordered
array of messages, and every view state is derived from it plus a small amount of UI-local
state (scroll position, composer draft, expanded tool cards).

**Enforcement:** review; the shape is enforced by the event reducer in `core` being pure.

## C2.7 — Streaming is a projection, not a re-render of everything

Assistant text arrives as deltas. The store appends deltas into the streaming message only; it
does not rebuild the message list per delta, and it does not write a delta to disk per delta. The
transcript is written when a message ends.

**Enforcement:** review, plus an E2E assertion that a 200-delta response produces a bounded
number of store writes.
