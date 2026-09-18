# 03 — Product Scope

This file exists so that the answer to "why doesn't Alpha do X?" is written down once, instead
of being rediscovered in every feature discussion.

## C3.1 — Bring your own key, and only your own key

Alpha ships **no** bundled credentials, no shared proxy, no trial quota, and no account. A user
adds a provider and a key, or the workbench has no model to talk to and says so plainly.

The key is stored encrypted on the machine, is sent only to the provider it belongs to, and is
deleted when the user deletes the provider. Nothing about the user's usage is reported anywhere.

**Enforcement:** no network call may be made to a host that is not a configured provider, the
app's own update check, or a documented documentation link. `pnpm check:constraints` scans for
hard-coded hosts outside the provider templates module.

## C3.2 — No worktree support

Alpha is not a version-control tool. It does not create git worktrees, does not manage branches,
does not commit, and does not require a repository at all: a workspace is a folder. The agent can
run `git` through its own tools like any other command, under the same permission gate as any
other command.

An earlier design considered a per-conversation worktree so that parallel conversations could not
collide. It was cut: it forces every conversation into a git repository, doubles the concepts a
new user must learn, and solves a problem that permission levels already make visible.

**Enforcement:** review. This constraint exists to stay cut.

## C3.3 — One window, one machine, no sync

Alpha is local-first and single-user. There is no account, no cloud storage, no collaboration, no
telemetry beyond an optional crash log the user can read, and no background daemon. Conversations
live in the app's data directory and can be exported as plain files.

**Enforcement:** review; C3.1's host allowlist covers the network angle.

## C3.4 — The permission levels are the safety model

Four levels, exactly: `plan`, `ask`, `accept-edits`, `full-access`. They are the whole answer to
"what can the agent do without asking?". Alpha does not add a sandbox, a container, a seccomp
profile, or a per-tool allowlist DSL beyond the remembered rules a user creates by approving
something twice.

The level is chosen per conversation, defaulting from the workspace, and is always visible in the
window — a user must never have to guess which level is active.

**Enforcement:** the level list is a closed union in `core`; a test asserts each level's decision
for each tool risk class, and the UI has a visible level chip in every conversation view.

## C3.5 — Reference points, and what is borrowed from each

| Reference | Borrowed | Not borrowed |
| --- | --- | --- |
| ChatGPT desktop | Conversation list, message rhythm, a composer that grows | Marketing chrome, model picker hidden in a menu |
| Claude desktop | Restrained typography, calm empty states, side panel for artifacts | Artifact-first framing |
| ZCode / Claude Code | Permission levels and the approval prompt, tool cards with real output, thinking visibility | Terminal-first interaction, its keybindings |
| Codex CLI | The read-only / auto / full-access ladder | Its CLI transcript formatting |

**Enforcement:** [05-design.md](./05-design.md) turns the borrowed column into tokens and
components.

## C3.6 — Explicit non-goals for the first release

Each of these is a deliberate cut, not an oversight:

- No multi-agent orchestration, no sub-agent spawning from the UI.
- No plugins, no extension API, no user-authored tools.
- No image generation, no voice, no attachments beyond images pasted into the composer.
- No mobile or web build: Electron only.
- No i18n scaffolding. The UI ships in English; the project's documentation and the team's chat
  may be Chinese, and copy is written so a single locale is not baked into component logic.
