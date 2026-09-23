# 02 — Architecture

## C2.0 — The agent is a library Alpha links, and it links into `main` and the capabilities

A conversation is an in-process agent session: Alpha embeds `@earendil-works/pi-agent-core` in the
main process and builds each run on it ([ADR-0025](../adr/0025-the-agent-is-embedded-and-the-workbench-is-the-base.md)).
There is no child process to find, install or keep alive, and no package of Alpha's ships a CLI.
What Alpha builds on top of the library is its own: the plugin base the agent is assembled from,
the gate, the session store, the conversation list, and the credentials. The window never imports a
pi package — it reaches the agent through the contract.

Two kinds of package may name it, and nothing else may: `main`, which drives the run, and the
packages listed by name in the checker (`AGENT_LINKING_PACKAGES`, and the `May import` column in
C2.1) — the capabilities whose face *is* the agent's own shape (a tool is an `AgentTool`), which is
[C2.8](#c28--a-capability-is-a-plugin-not-a-branch-in-the-runtime)'s exception carrying its own
adapter, and `@alpha/history`, the fold that turns a session's entries into the messages an agent
starts from. The list is written down rather than inferred, so the exception stays countable, and
a package that wants in asks by adding itself to it and to the table.

**Enforcement:** `pnpm check:constraints` rule `02-architecture:no-agent-dependency` fails on an
import of a `@earendil-works/*` package (or a `pi-agent-core`/`pi-ai` name) anywhere under
`apps/desktop/src` except `main`, and anywhere under `packages/*/src` except the packages the
checker lists as capability packages — the pure libraries, the ones around the workbench's own
files, and the window all stay clear of it.

## C2.1 — One workbench, a handful of libraries, one direction

```
apps/desktop/src/          the app: one package, three processes
  main/      ──┐
  preload/   ──┼──> @alpha/domain ──┬──> @alpha/i18n       the pure ones: the rules, the
  renderer/  ──┘                    ├──> @alpha/contract     dictionary, the wire between
                                    └──> @alpha/plugin       processes, and the plugin base
                          ├──> @alpha/state
                          ├──> @alpha/sessions
                          ├──> @alpha/history ──> @alpha/sessions
                          ├──> @alpha/conversations
                          ├──> @alpha/tasks
                          ├──> @alpha/providers ──> @alpha/contract
                          ├──> @alpha/gate ──> @alpha/plugin, @alpha/state
                          ├──> @alpha/retry ──> @alpha/plugin
                          ├──> @alpha/coding-tools ──> the agent library
                          └──> @alpha/compaction ──> @alpha/history, @alpha/plugin, the agent library
```

An arrow points the way an import goes: the app may import any library; the capabilities add what
they need — the two pure ones take the plugin base (the gate also reads the state file), compaction
takes the plugin base, the session store and the history fold, and the two that carry their own
adapters name the agent library, which is what C2.0's exception is for; everything else sits
directly on the rules.

| Library | Holds | May import |
| --- | --- | --- |
| `@alpha/i18n` | The dictionary: the interface's words in both languages, and `text()` | nothing from this repo |
| `@alpha/domain` | The rules: permissions, providers, transcripts, tasks, schedules, tool rows, validation schemas | `@alpha/i18n` |
| `@alpha/contract` | The IPC contract: the channel names and the types the bridge exposes | `@alpha/domain`, `@alpha/i18n` |
| `@alpha/plugin` | The plugin base: what a face is handed and what it answers, and how faces in order become one decision | `@alpha/domain` |
| `@alpha/state` | The one file the workbench persists for itself | `@alpha/domain` |
| `@alpha/sessions` | The conversation on disk: the JSONL transcript, its entries, the decisions made about its tool calls | `@alpha/domain` |
| `@alpha/history` | The messages an agent starts from: the entries folded into pi's transcript, with the entry each message came from | `@alpha/domain`, `@alpha/sessions`, the agent library |
| `@alpha/conversations` | The list the sidebar shows, the bookkeeping that keeps it true, and the messages waiting to be sent | `@alpha/domain` |
| `@alpha/tasks` | The scheduled tasks: the file, the clock that decides when one comes due, the service | `@alpha/domain` |
| `@alpha/providers` | The connections: the providers configured, the key vault, and which model a conversation runs on | `@alpha/domain`, `@alpha/contract` |
| `@alpha/gate` | The permission ladder, the approvals broker, the refusal a run with nobody watching gets, the ports into the workbench's own file, and the face it hangs on the agent | `@alpha/domain`, `@alpha/plugin`, `@alpha/state` |
| `@alpha/retry` | Auto-retry: the decision a failed run's end is judged with, and the hook that spends an attempt on it | `@alpha/plugin` |
| `@alpha/coding-tools` | The four tools the agent works with — read, bash, edit, write — over the conversation's workspace, as a face on the base | the agent library, node |
| `@alpha/compaction` | Folding a long conversation: what it occupies, the tail a summary leaves, and the plugin that summarizes, rewrites the agent and writes the entry | `@alpha/domain`, `@alpha/history`, `@alpha/plugin`, `@alpha/sessions`, the agent library |
| `@alpha/desktop` | The Electron main process, the agent runtime, storage, the contextBridge, the Solid UI | every library, node, electron (not in the renderer) |

`packages/` holds libraries — what the workbench depends on. The workbench lives in
`apps/desktop`, one package whose three processes are directories, which keeps the split the rest of
this document is about (the window has no Node, the bridge is the only door, the runtime is in
`main`) without pretending the workbench and the libraries it depends on are peers. The agent
runtime stays: driving a run — waiting it out, dropping a failed turn, continuing the agent — is
`main`'s own work, while the capabilities it drives have moved out to their own packages
([C2.0](#c20--the-agent-is-a-library-alpha-links-and-it-links-into-main-and-the-capabilities)).

Dependencies never point backwards: the libraries know nothing about the workbench, and no process
imports `main`'s runtime. Which library may import which is the `May import` column, and it is a
rule rather than a sentence — nothing points sideways either.

**Enforcement:** five of the checker's rules and one linter keep this shape.
`02-architecture:processes-stay-apart` fails on a relative import from one of the app's three
processes into another — the window cannot reach the runtime's files, the runtime cannot reach the
window's — which is what separate packages used to enforce by existing.
`02-architecture:pure-packages-have-no-io` fails on any `electron` or Node builtin import under the
dictionary, the rules, the plugin base and the contract; `02-architecture:no-electron-in-libraries`
fails on an `electron` import under any package at all — a library may read the disk, it may never
hold a window, because a library that owns a window cannot be tested on its own.
`02-architecture:libraries-point-one-way` is the `May import` column, read as a rule: it fails on an
`@alpha/*` import that is not below the importing library (a package the table does not name may
import none of them), and on a relative import that climbs out of its own package.
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

## C2.8 — A capability is a plugin, not a branch in the runtime

The agent is assembled from plugins of Alpha's own
([ADR-0025](../adr/0025-the-agent-is-embedded-and-the-workbench-is-the-base.md)). A plugin is a name
plus the faces it contributes, and the base attaches each face where it belongs: the tools it adds
become the agent's tools, its `beforeToolCall` joins the chain the base hands the agent (the chain
itself is `chainToolVerdicts`, in `@alpha/plugin`), and its `afterRun` is asked when a run ends —
handed the outcome and not the agent, through `chainAfterRunVerdicts`, where any hook asking for a
retry is enough and an aborted run is never one. So a capability is added as a face on that
contract, with a decision behind it that stands without the agent. A hook that needs more than the
outcome holds its own ports — the compaction plugin reads the live agent and the store that way —
so what travels through a face is never pi's own shapes. The base is what other functions are built
on, not one more thing wired into the runtime.

A plugin may also hand the runtime a handle, and two built-ins do: the compaction plugin's
on-demand path, which "compact now" calls, and the retry plugin's decision, which the runtime asks
when a run ends to learn whether the turn is over. Both are the plugin answering rather than the
runtime knowing: they come back from the same registration point as the faces, and no policy is
copied out of the plugin.

Where that decision lives follows the rule the packages were split by ([C2.1](#c21--one-workbench-a-handful-of-libraries-one-direction)):
the part that holds without pi names nothing of pi's and lives in a library, where it is read and
tested alone. Four capabilities now go all the way — `@alpha/gate` decides what a call may do *and*
carries its own `beforeToolCall` face; `@alpha/retry` decides whether a failed run is driven again
*and* carries its own `afterRun`; `@alpha/coding-tools` offers the four tools and names the agent
library to do it; `@alpha/compaction` measures, summarizes and rewrites, with its threshold as a
policy that needs no agent — so the app holds nothing but the registrations. What stays in `main` is
the run itself: assembly, the `afterRun` driver, the events translated for the window. That is the
base rather than a capability, and a capability never grows a branch there.

`pluginsFor` in the assembly is the one place a capability is registered: the runtime holds the
faces and handles the plugins gave it, and a feature that needs registration somewhere else to reach
the agent has not found its face yet.

Three things are neither plugins nor branches, and the distinction is worth keeping: what the agent
is handed (the model, the system prompt, the history it starts from), what it writes through (the
session store the assembly injects), and what drives it from outside (a prompt, a steer, a fork, a
task coming due, compacting by hand). Those are the base's inputs and its callers; a capability is
what the agent may do, and that is the contract.

**Enforcement:** `pnpm check:constraints` rule `02-architecture:capabilities-are-plugins` fails on a
plugin factory called anywhere in `main` but the assembly and a test file — the naming convention,
`create<Something>Plugin`, is what makes its call sites findable, and a test may script a plugin to
drive what it tests. Review covers the rest: whether a capability arrived as a face on the contract
over a decision that stands alone, registered in the one place, or as one more branch in the
runtime.
