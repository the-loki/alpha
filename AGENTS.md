## Communication

Chat replies use Chinese (简体中文).

## Alpha

A local-first Electron workbench that runs the `pi` the person installed against a folder on your
machine. Alpha ships no agent: it finds `pi`, drives it over its RPC protocol, and owns the window,
the IPC contract, the permission gate, the decisions and the credentials. Read `CONTEXT.md` before
naming anything in code, issues, or UI copy: it fixes the vocabulary (workspace, conversation, turn,
permission level, approval, provider, credential, model).

### Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Electron with the renderer on Vite HMR |
| `pnpm check` | Constraints, typecheck, Biome, unit tests — run before every commit |
| `pnpm test:e2e` | Builds, then drives the real window with Playwright |
| `pnpm check:constraints` | Only the rules in `docs/constraints/` |

### Layout

`apps/desktop` is the workbench: `src/main` is the Electron main process and the agent runtime, `src/preload`
is the contextBridge, `src/renderer` is the Solid UI. `packages/core` is the one library — pure domain
and the IPC contract. The app depends on `core` and never backwards.

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
