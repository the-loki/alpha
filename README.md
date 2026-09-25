# Alpha

A local-first desktop workbench with the agent built in. It works against a folder you choose,
with your own key — choose how much the agent may do without asking, and read every tool call it
made in a ledger you can audit afterwards.

Alpha is an Electron workbench, and the agent runs inside it: an embedded agent core, assembled from
a plugin base of Alpha's own — the workspace tools, the permission gate, compaction, auto-retry. The
window receives a projection of the conversation over a typed IPC contract, and the credential, the
permission ladder and the decisions stay in the main process.

## Install

```bash
pnpm install
pnpm dev            # run it from source
pnpm package:linux   # AppImage + deb
pnpm package:mac     # dmg      (build on macOS)
pnpm package:win     # nsis     (build on Windows)
```

The packaged builds land in `apps/desktop/dist/`. Each platform's installer has to be produced on that
platform — that is electron-builder's rule, not a limitation of the app.

## From a browser

The workbench can serve itself to a browser on another device — a laptop on the couch, a phone, a
second machine. Settings → *Browser access* switches it on, picks a port, and shows the token a
browser has to be given.

It binds to this machine (`127.0.0.1`) by default; choosing *Anything on this network* opens it to
every interface this machine has, and shows the addresses to use. Whoever holds the token can read
every conversation, approve every tool call, and change the permission level: a browser client is a
remote control for this machine, not a viewer. The token is stored in the workbench state file in
plaintext, and can be replaced from the same page — which signs every browser out at once, and puts
each of them back on the unlock screen.

A browser cannot open a native folder dialog, so it is offered none: it works in one of the folders
in the recent list, and says so when there is no list to pick from. Window controls are not drawn
there either, because there is no window of ours to move.

## First run

1. **Open a workspace.** Relative tool paths and commands start in this folder. Alpha gates tool
   calls but does not confine reads, writes or commands to the folder (see below). The choice is
   remembered, and the folder's name groups your conversations in the sidebar.
2. **Add a provider.** Settings → *Add a provider*: pick one of the three wire protocols it speaks,
   paste its base URL, then add the models it serves underneath it. Nothing is bundled and no key
   ships with the workbench.
3. **Pick a model.** The chip at the foot of a conversation's composer, or Settings. Each
   conversation keeps its own choice, and so does its thinking effort. To show conversation cost,
   enable *Track cost* on a model and enter its USD rates per million tokens; Alpha does not supply
   prices.
4. **Ask for something.** `Enter` sends. The reply streams in, and every tool call it makes appears
   as a row in the ledger.

### Keys

Keys are encrypted with the OS keychain (`safeStorage`) when it is available; the settings page
says which of the two it is using. A key never crosses the IPC boundary towards the window: the
window can set one, and can never read one back.

## The permission ladder

Four levels, on the chip in the composer's foot row. The level decides before anything runs, and the
decision is what the transcript records afterwards:

| Level | Reads | File changes | Commands |
| --- | --- | --- | --- |
| **Plan** | allowed | blocked | blocked |
| **Ask** | allowed | ask | ask |
| **Accept edits** | allowed | allowed | ask |
| **Full access** | allowed | allowed | allowed |

When the level asks, a card appears inline in the transcript — a surface step, a hairline, and an
amber mark while it waits — with the exact command or the file and its diff, the folder it will run
in, and three answers: **Allow once**, **Always allow** (this conversation or this workspace), or
**Deny** with a reason. `Enter` allows once; `Escape` only moves focus away, because a denial is an
act rather than a dismissal. A denial is returned to the model as the reason the call failed, so it
adapts instead of retrying.

"Always allow" writes a remembered rule — a tool name plus a command prefix or a path prefix.
Settings lists them, and revoking one brings the question back on the next matching call.

## Where things live

Alpha keeps everything under one data directory: `$ALPHA_DATA_DIR` when set, otherwise Electron's
per-user data directory.

| Platform | Default data directory |
| --- | --- |
| Linux | `~/.config/Alpha` |
| macOS | `~/Library/Application Support/Alpha` |
| Windows | `%APPDATA%\Alpha` |

| File | What it is |
| --- | --- |
| `workbench-state.json` | The workbench's own settings: the workspace and the recent folders, the default permission level (and any the folders override), the theme, the language, the last conversation opened, the remembered rules, and the browser access settings |
| `conversations.json` | The sidebar's index: titles, ordering, status |
| `sessions/--<workspace-slug>--/<timestamp>_<id>.jsonl` | The transcripts themselves, append-only (ADR-0004), grouped one folder per workspace |
| `credentials.json` | Provider credentials, encrypted by the OS keychain where there is one |
| `providers.json` | Provider connections, models, optional price rates, and the default model |
| `decisions/<id>.json` | How each tool call got past the gate, so a restored ledger still says why (ADR-0007) |
| `mcp.json` | Configured MCP servers, including their environment variables or HTTP headers in plaintext |
| `tasks.json` | Scheduled tasks and recent run outcomes |
| `workspace-changes/<id>.json` | Recent per-run workspace reviews and a recoverable pending baseline |
| `mcp-exchanges/<id>.json` | MCP elicitation and sampling requests, decisions, and usage for a conversation |

Deleting a conversation deletes its session file, decision log, workspace reviews, and MCP request
audit. Export writes a self-contained markdown file next to the workspace.

## What it does not do

- No sandbox and no worktrees: the safety model is the ladder and the approval card (ADR-0002).
- No telemetry. Outbound model calls go to configured providers; configured MCP servers may also be
  reached over HTTP. Browser access listens on this machine only when enabled.

## Working on it

```bash
pnpm check           # constraints, types, lint, unit and integration tests
pnpm test:e2e        # builds, then Playwright drives the real app
pnpm dev             # electron-vite dev server with HMR in the renderer
```

`docs/constraints/` is the contract the code is held to, and `pnpm check:constraints` enforces the
machine-checkable parts of it. `docs/adr/` records the decisions that are expensive to reverse.
`CONTEXT.md` is the vocabulary — the code, the issues and the copy use those words and no others.

Layout:

```
apps/desktop            the workbench: one package, three processes
  src/main              the embedded agent's runtime, the IPC handlers, the seams Electron owns
  src/preload           the bridge: the only functions the window gets
  src/renderer          Solid, @solidjs/router, Tailwind, remark — the window and nothing else
packages/i18n           pure: the dictionary, both languages, and text()
packages/domain         pure: the rules — transcripts, permissions, providers, tasks, schedules
packages/contract       pure: the channel names and the types the bridge exposes
packages/plugin         pure: the plugin base — a face's vocabulary, and how faces become one decision
packages/state          the one file the workbench persists for itself
packages/sessions       the conversation on disk: the transcript, its entries, its decisions
packages/conversations  the list the sidebar shows, and the messages waiting to be sent
packages/tasks          the scheduled tasks: the file, the clock, the service
packages/providers      the connections, the key vault, and the model a conversation runs on
packages/agent          the agent base: the plugin contract bound to pi, the assembly, the afterRun driver
packages/gate           the permission machinery: the ladder, the approvals broker, the refusal
packages/mcp            the MCP client: server settings, transports, requests, and tools
packages/subagents      the policy for delegated task calls and their limits
packages/internal-plugins  Alpha's own plugins, one file each: gate, auto-retry, workspace tools,
                           compaction, MCP, subagents
e2e                     Playwright specs that launch the built app
tools/constraints       the checker that keeps the constraints honest, one module per document that has machine-checkable rules
tools/design            the tests that read the palette and the type scale out of the stylesheet
tools/docs              the test that holds the ADR index to the decisions it maps
```
