## Communication

Chat replies use Chinese (简体中文).

## Alpha

A local-first Electron workbench that runs a `pi` agent against a folder on your machine. Read
`CONTEXT.md` before naming anything in code, issues, or UI copy: it fixes the vocabulary
(workspace, conversation, turn, permission level, approval, provider, credential, model).

### Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Electron with the renderer on Vite HMR |
| `pnpm check` | Constraints, typecheck, Biome, unit tests — run before every commit |
| `pnpm test:e2e` | Builds, then drives the real window with Playwright |
| `pnpm check:constraints` | Only the rules in `docs/constraints/` |

### Layout

`packages/core` is pure domain and the IPC contract; `packages/main` is the Electron main process
and the agent runtime; `packages/preload` is the contextBridge; `packages/renderer` is the React
UI. Dependencies point at `core` and never backwards.

### Before writing code here

`docs/constraints/` is binding, not advisory — it carries the size budgets, the `null` ban, the
process split, and the scope cuts, each with how it is enforced. Decisions that were expensive to
reverse are in `docs/adr/`.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `the-loki/alpha`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.

### Ponytail

All coding tasks load the `ponytail` skill.

### TDD

All coding tasks follow TDD.
