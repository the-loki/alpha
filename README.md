# Alpha

A local-first desktop workbench for a pi agent. Bring your own key, choose how much the agent may
do without asking, and read every tool call it made in a ledger you can audit afterwards.

Alpha is an Electron app: a warm Ink interface around the `pi` agent core, with the model, the
tools and the transcript all running in the main process and the window receiving a projection of
it over a typed IPC contract.

## Install

```bash
pnpm install
pnpm dev            # run it from source
pnpm package:linux   # AppImage + deb
pnpm package:mac     # dmg      (build on macOS)
pnpm package:win     # nsis     (build on Windows)
```

The packaged builds land in `dist/`. Each platform's installer has to be produced on that
platform — that is electron-builder's rule, not a limitation of the app.

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

Deleting a conversation deletes its session directory. Export writes a self-contained markdown file
next to the workspace.

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
packages/core       pure: the transcript projection, the permission table, the IPC contract
packages/main       the runtime: pi harness, sessions, providers, the gate, the IPC handlers
packages/preload    the bridge: the only functions the window gets
packages/renderer   React, TanStack Router, Tailwind, Zustand — the window and nothing else
e2e                 Playwright specs that launch the built app
tools/constraints   the checker that keeps the constraints honest
```
