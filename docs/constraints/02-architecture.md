# 02 — Architecture

## C2.0 — The agent is a library Alpha links, and it links into main alone

A conversation is an in-process agent session: Alpha embeds `@earendil-works/pi-agent-core` in the
main process and builds each run on it ([ADR-0025](../adr/0025-the-agent-is-embedded-and-the-workbench-is-the-base.md)).
There is no child process to find, install or keep alive, and no package of Alpha's ships a CLI.
What Alpha builds on top of the library is its own: the plugin base the agent is assembled from,
the gate, the session store, the conversation list, and the credentials. The window and the
libraries never import a pi package — they reach the agent through the contract, and so does
everything else.

**Enforcement:** `pnpm check:constraints` rule `02-architecture:no-agent-dependency` fails on an
import of a `@earendil-works/*` package (or a `pi-agent-core`/`pi-ai` name) anywhere under
`apps/desktop/src` except `main`, and anywhere under `packages/*/src`.

## C2.1 — One workbench, a few libraries, one direction

```
apps/desktop/src/          the app: one package, three processes
  main/      ──┐
  preload/   ──┼──> @alpha/domain    (pure TypeScript: the rules the workbench decides with)
  renderer/  ──┘    @alpha/contract   (the IPC contract the three processes meet at)
                    @alpha/i18n       (the dictionary the interface is written in)
```

| Package | Holds | May import |
| --- | --- | --- |
| `@alpha/i18n` | The dictionary: the interface's words in both languages, and `text()` | nothing from this repo |
| `@alpha/domain` | The rules: permissions, providers, transcripts, tasks, schedules, tool rows, validation schemas | `@alpha/i18n` |
| `@alpha/contract` | The IPC contract: the channel names and the types the bridge exposes | `@alpha/domain`, `@alpha/i18n` |
| `@alpha/desktop` | The Electron main process, the agent runtime, storage, the contextBridge, the Solid UI | the three, node, electron (not in the renderer) |

`packages/` holds libraries — what the workbench depends on. The workbench lives in
`apps/desktop`, one package whose three processes are directories, which keeps the split the rest of
this document is about (the window has no Node, the bridge is the only door, the runtime is in
`main`) without pretending the workbench and the library it depends on are peers.

Dependencies never point backwards: the libraries know nothing about the workbench, and no process
imports `main`'s runtime. While the call sites move over they still name `@alpha/core`, which
re-exports the three; that name is on its way out, and goes when the last of them has.

**Enforcement:** five of the checker's rules and one linter keep this shape.
`02-architecture:processes-stay-apart` fails on a relative import from one of the app's three
processes into another — the window cannot reach the runtime's files, the runtime cannot reach the
window's — which is what separate packages used to enforce by existing.
`02-architecture:pure-packages-have-no-io` fails on any `electron` or Node builtin import under the
dictionary, the rules and the contract; `02-architecture:no-electron-in-libraries` fails on an
`electron` import under any package at all — a library may read the disk, it may never hold a
window, because a library that owns a window cannot be tested on its own.
`02-architecture:libraries-point-one-way` is the `May import` column above, read as a rule: it fails
on an `@alpha/*` import that is not below the importing library (a package the table does not name
may import none of them), and on a relative import that climbs out of its own package.
And `02-architecture:renderer-is-solid` keeps the window on the framework it was rebuilt on.
Biome's `style/noRestrictedGlobals` keeps the renderer off `process`, `require`, and `Buffer`.

## C2.2 — The renderer talks to the main process through one contract

All cross-process traffic is declared once, as types plus channel names, in `@alpha/contract`.
The renderer never touches `ipcRenderer`; it calls the typed client the preload exposes
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
`style/noRestrictedImports` (scoped to `apps/desktop/src/renderer`) fails on an agent-package import
at lint time, and `pnpm check:constraints` rule `02-architecture:renderer-has-no-model-client`
catches it in the same scan that checks everything else.

The window is drawn by Solid (ADR-0021), and that is a boundary too: rule
`02-architecture:renderer-is-solid` fails on a React, TanStack, zustand or react-markdown import
under `apps/desktop/src/renderer/`, so the framework cannot creep back one file at a time.

## C2.4 — A key goes from the vault to the model runtime, and nowhere else

A credential is read from encrypted storage inside `main` and handed to the model runtime in
memory, as the answer to an auth question asked at request time. It never crosses the IPC boundary
in plaintext: the renderer may learn *that* a credential exists, and may send a new one *to* be
stored, never read one back. Nor is it written into a file or an environment variable — there is
no second process to hand it to, and a secret that sits in a file or an env line outlives the run
that needed it.

**Enforcement:** `pnpm check:constraints` fails if any renderer file reads a field whose name
matches `/apiKey|secret|credential/i` off a provider payload; review covers the rest.

## C2.5 — Size budgets

| Thing | Limit |
| --- | --- |
| Function or method body | 60 lines |
| Component body | 120 lines |
| File | 300 lines |
| `createEffect` in one component | 2 |

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

**Enforcement:** review; the shape is enforced by the event reducer in `@alpha/domain` being pure.

## C2.7 — Streaming is a projection, not a re-render of everything

Assistant text arrives as deltas. The store appends deltas into the streaming message only; it
does not rebuild the message list per delta, and it does not write a delta to disk per delta. The
transcript is written when a message ends.

**Enforcement:** review, plus an E2E assertion that a 200-delta response produces a bounded
number of store writes.
