# Alpha

A local-first desktop workbench with the agent built in. It works against a folder you choose,
with your own key — choose how much the agent may do without asking, and read every tool call it
made in a ledger you can audit afterwards.

Alpha is an Electron app, and the agent runs inside it: an embedded agent core, assembled from a
plugin base of Alpha's own — the workspace tools, the permission gate, compaction, auto-retry. The
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

1. **Open a workspace.** The folder the agent works in. Everything it reads, writes and runs is
   inside it; Alpha does not sandbox, it gates (see below). The choice is remembered, and the
   folder's name is what groups your conversations in the sidebar.
2. **Add a provider.** Settings → *Add a known provider* for Anthropic, OpenAI, Google, DeepSeek,
   OpenRouter and friends, or *Custom endpoint* for anything speaking the OpenAI or Anthropic wire
   protocol. Paste a base URL and a key. Nothing is bundled and no key ships with the app.
3. **Pick a model.** The header's model menu, or Settings. Each conversation keeps its own choice,
   and so does its thinking effort.
4. **Ask for something.** `Enter` sends. The reply streams in, and every tool call it makes appears
   as a row in the ledger.

### Keys

Keys are encrypted with the OS keychain (`safeStorage`) when it is available; the settings page
says which of the two it is using. A key never crosses the IPC boundary towards the window: the
window can set one, and can never read one back.

## The permission ladder

Four levels, in the header's chip. The level decides before anything runs, and the decision is what
the transcript records afterwards:

| Level | Reads | File changes | Commands |
| --- | --- | --- | --- |
| **Plan** | allowed | blocked | blocked |
| **Ask** | allowed | ask | ask |
| **Accept edits** | allowed | allowed | ask |
| **Full access** | allowed | allowed | allowed |

When the level asks, an amber-railed card appears inline in the transcript with the exact command
or the file and its diff, the folder it will run in, and three answers: **Allow once**, **Always
allow** (this conversation or this workspace), or **Deny** with a reason. `Enter` allows once,
`Escape` denies. A denial is returned to the model as the reason the call failed, so it adapts
instead of retrying.

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
| `workbench-state.json` | Workspace, recent folders, permission level, theme, remembered rules |
| `conversations.json` | The sidebar's index: titles, ordering, status |
| `sessions/<id>/*.jsonl` | The transcripts themselves, append-only (ADR-0004) |
| `credentials.json` | Provider credentials, encrypted by the OS keychain where there is one |
| `decisions/<id>.json` | How each tool call got past the gate, so a restored ledger still says why (ADR-0007) |

Deleting a conversation deletes its session directory and its decision log. Export writes a
self-contained markdown file next to the workspace.

## What it does not do

- No sandbox and no worktrees: the safety model is the ladder and the approval card (ADR-0002).
- No telemetry, and no host but the providers you configure.

## Working on it

```bash
pnpm check           # constraints, types, lint, unit and integration tests
pnpm test:e2e        # Playwright drives the real app (run `pnpm build` first)
pnpm dev             # electron-vite dev server with HMR in the renderer
```

`docs/constraints/` is the contract the code is held to, and `pnpm check:constraints` enforces the
machine-checkable parts of it. `docs/adr/` records the decisions that are expensive to reverse.
`CONTEXT.md` is the vocabulary — the app uses those words and no others.

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
packages/history        the messages an agent starts from: the entries folded into pi's transcript
packages/conversations  the list the sidebar shows, and the messages waiting to be sent
packages/tasks          the scheduled tasks: the file, the clock, the service
packages/providers      the connections, the key vault, and the model a conversation runs on
packages/agent          the base: the plugin contract bound to pi, the assembly, the afterRun driver
packages/gate           the permission machinery: the ladder, the approvals broker, the refusal
packages/internal-plugins  Alpha's own plugins, one file each: gate, auto-retry, tools, compaction
e2e                     Playwright specs that launch the built app
tools/constraints       the checker that keeps the constraints honest, one module per document
```
