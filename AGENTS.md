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
| `pnpm check` | Constraints, typecheck, Biome, unit and integration tests — run before every commit |
| `pnpm test:e2e` | Builds, then drives the real window with Playwright |
| `pnpm check:constraints` | Only the rules in `docs/constraints/` |

### Layout

`apps/desktop` is the workbench: `src/main` is the Electron main process and the agent runtime, `src/preload`
is the contextBridge, `src/renderer` is the Solid UI. `packages/` holds its thirteen libraries — the dictionary
(`@alpha/i18n`), the rules (`@alpha/domain`), the contract between the processes (`@alpha/contract`), the plugin
base's pure faces (`@alpha/plugin`), the agent base where those faces meet pi — the history a run starts from, the
assembly, the driver (`@alpha/agent`), the permission machinery the workbench owns (`@alpha/gate`), Alpha's own
plugins (`@alpha/internal-plugins` — one file each, and a package that names the agent library), the
MCP client (`@alpha/mcp`), and the files the
workbench keeps for itself: `@alpha/state`, `@alpha/sessions`, `@alpha/conversations`, `@alpha/tasks`,
`@alpha/providers`. No library
may import Electron, and only the packages C2.0 lists may name the agent library; the workbench
depends on them and never backwards.

### Before writing code here

`docs/constraints/` is binding, not advisory — it carries the size budgets, the `null` ban, the
process split, and the scope cuts, each with how it is enforced. Decisions that were expensive to
reverse are in `docs/adr/`, mapped in its README (what binds today, and what replaced what). A new capability of the agent is a plugin on the base (C2.8), not a
branch in the runtime: a file in `@alpha/internal-plugins` — a face, the decision behind it, and the
adapter where the face is pi's own shape — with `main` keeping the registration.

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
