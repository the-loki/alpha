# 03 — Product Scope

This file exists so that the answer to "why doesn't Alpha do X?" is written down once, instead
of being rediscovered in every feature discussion.

## C3.1 — Bring your own key, and only your own key

Alpha ships **no** bundled credentials, no shared proxy, no trial quota, and no account. A user
adds a provider and a key, or the workbench has no model to talk to and says so plainly.

The key is stored encrypted on the machine, is sent only to the provider it belongs to, and is
deleted when the user deletes the provider. Nothing about the user's usage is reported anywhere.

**Enforcement:** no network call may be made to a host that is not a configured provider, the
app's own update check, or a documented documentation link. `pnpm check:constraints` scans every
file in the repository for a hard-coded host, exempting the constraint documents themselves, the
specs, the tests, the checker's own sources, and the one module that listens on this machine's own
address (`apps/desktop/src/main/server/http.ts` — it listens, so it has to say where, and a
provider host is a violation there too). There is no provider catalog to make an exception for: the
user types the base URL, and the only address Alpha knows is the one it binds
([ADR-0015](../adr/0015-three-protocols-and-no-catalog.md)).

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

**Enforcement:** the level list is a closed union in `@alpha/domain`; a test asserts each level's decision
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

## C3.6 — Three wire protocols, and no catalog

Alpha speaks exactly three protocols — `openai-completions`, `openai-responses`,
`anthropic-messages` — and ships no catalog of providers. A person adds a connection by naming
its base URL and picking one of the three; there is no "add Anthropic" button, because that button
is a host, a logo and a key format that have to be maintained forever, and because the list of
OpenAI-compatible endpoints is longer than any catalog can track.

The three are the mainstream: OpenAI's original shape, OpenAI's newer one, and Anthropic's. The
first covers most of the rest, since a gateway, a local server and a hosted provider that "speaks
OpenAI" all take the same request.

**Enforcement:** `PROVIDER_APIS` is a closed union in `@alpha/domain`, `pnpm check:constraints` scans for
hosts, and no settings copy names a provider as a thing to add.

## C3.7 — Explicit non-goals

Each of these is a deliberate cut, not an oversight. Four of them were written for the first
release and have since been decided the other way — or narrowed, which is said the same way; what
changed is written with them rather than quietly dropped.

- No multi-agent orchestration, no sub-agent spawning from the UI.
- No extension API for other people's code, and no user-authored tools. The plugin base (C2.8) is
  Alpha's own assembly — the shape a capability inside this repository is written in — not a surface
  a person installs something onto. *Changed:* a workbench may be configured with **MCP servers**
  ([ADR-0028](../adr/0028-an-mcp-server-is-reached-not-loaded.md)), which are code somebody else
  wrote, offering tools Alpha did not ship. They are reached over a protocol — in their own process,
  or at the endpoint they name — and never loaded into Alpha, so what the cut was protecting holds:
  nothing a person installs runs inside the workbench, and the tools it offers are decided about by
  the same ladder as Alpha's own.
- No image generation, no voice, no attachments beyond images pasted into the composer.
- No mobile app. *Changed:* the workbench is served to a browser (C6), which was once a cut, and
  that page is expected to stay usable at phone widths (C5.4) — but nothing ships for a phone, and
  there is no phone build.
- No translation pipeline. *Changed:* the interface ships in two languages, English and Chinese,
  both written by hand in one dictionary (ADR-0010). There is no locale-file generator, no
  translation service, and no RTL work; copy is still written so a single locale is not baked into
  component logic.
