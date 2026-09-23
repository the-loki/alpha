## Communication

Chat replies use Chinese (简体中文).

## Alpha

A local-first Electron workbench with its agent embedded: the agent (built on `pi-agent-core`) runs
in the main process, assembled from Alpha's own plugin base — the tools, the permission gate,
compaction, auto-retry — against a folder on your machine. Alpha owns the window, the IPC contract,
the permission gate, the decisions, the credentials and the session store. Read `CONTEXT.md` before
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
is the contextBridge, `src/renderer` is the Solid UI. `packages/` holds its nine libraries — the dictionary
(`@alpha/i18n`), the rules (`@alpha/domain`), the contract between the processes (`@alpha/contract`), and the
ones that keep the workbench's own files: `@alpha/state`, `@alpha/sessions`, `@alpha/conversations`,
`@alpha/tasks`, `@alpha/providers`, `@alpha/gate`. None of them may import Electron or the agent library; the
app depends on them and never backwards.

### Before writing code here

`docs/constraints/` is binding, not advisory — it carries the size budgets, the `null` ban, the
process split, and the scope cuts, each with how it is enforced. Decisions that were expensive to
reverse are in `docs/adr/`. A new capability of the agent is a plugin on the base (C2.8), not a
branch in the runtime: a pure decision in a library, a hook face in `main`.

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
