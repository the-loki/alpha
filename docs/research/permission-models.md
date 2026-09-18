# Permission models in leading agent apps

Primary-source survey of how shipping agents gate tool actions. Researched 2026-09-18 against the
docs current on that date. Where a fact could not be verified from a primary source it is marked
**unverified** and omitted from any decision table.

Terminology in this file follows the products' own docs; Alpha's own vocabulary
(`plan`/`ask`/`accept-edits`/`full-access`, per `CONTEXT.md`) is only used in the Synthesis.

## 1. Claude Code / Claude Desktop

### 1.1 Permission modes (CLI + IDE + Desktop "Code" tab)

Verbatim mode list and behavior from <https://code.claude.com/docs/en/permission-modes>:

| Mode | What runs without asking | UI label(s) |
| --- | --- | --- |
| `default` | "Prompts for permission on first use of each tool." | **Manual** in CLI, VS Code, JetBrains, desktop app; `manual` accepted as alias ([modes](https://code.claude.com/docs/en/permission-modes)) |
| `acceptEdits` | "Automatically accepts file edits and common filesystem commands such as `mkdir`, `touch`, `mv`, and `cp`" for working-directory paths | **Accept edits** (desktop selector); CLI mode indicator `⏵⏵ accept edits on` ([modes](https://code.claude.com/docs/en/permission-modes), [desktop](https://code.claude.com/docs/en/desktop)) |
| `plan` | "Claude reads files and runs read-only shell commands to explore but doesn't edit your source files" | **Plan**; indicator `⏸ plan mode on` ([modes](https://code.claude.com/docs/en/permission-modes)) |
| `auto` | "Auto-approves tool calls with background safety checks that verify actions align with your request." | **Auto**; indicator `⏵⏵ auto mode on` ([modes](https://code.claude.com/docs/en/permission-modes)) |
| `dontAsk` | "Auto-denies every call that would otherwise prompt"; reads and pre-approved tools still run | CLI only — "available only in the CLI" ([modes](https://code.claude.com/docs/en/permission-modes), [desktop](https://code.claude.com/docs/en/desktop)) |
| `bypassPermissions` | "Skips permission prompts, except for the actions no mode auto-approves" | Indicator `⏵⏵ bypass permissions on` ([modes](https://code.claude.com/docs/en/permission-modes)) |

- Desktop selector exposes Manual, Accept edits, Plan, Auto, and (once enabled) Bypass permissions
  (<https://code.claude.com/docs/en/desktop>).
- Bypass/auto can be disabled by administrators with `permissions.disableBypassPermissionsMode` /
  `permissions.disableAutoMode` set to `"disable"` (<https://code.claude.com/docs/en/permission-modes>).
- Desktop `bypassPermissions` on Pro/Max needs Settings → Claude Code → "Allow bypass permissions
  mode"; on Team/Enterprise it is org-policy controlled; Desktop always asks before archiving a
  session "in every permission mode" (<https://code.claude.com/docs/en/desktop>).

### 1.2 Decision table by tool class

From the "Permission system" table at <https://code.claude.com/docs/en/permissions> (Manual/default
column; other modes change which rows prompt):

| Tool type | Example | Approval required at `default` | "Yes, and don't ask again" scope |
| --- | --- | --- | --- |
| Read-only | File reads, Grep | No, within working dir + additional dirs | N/A |
| Bash commands | Shell execution | Yes, except a built-in read-only set (e.g. `ls`, `cat`, `grep`, read-only git) | "Permanently per repository and command" |
| File modification | Edit/write files | Yes | "Until session end" |
| Web fetch | WebFetch | Yes, except preapproved documentation domains | "Permanently per repository and domain" |
| Web search | WebSearch | Yes | "Permanently per repository" |

- `plan` is read-only plus a built-in read-only Bash set; with auto mode available,
  "classifier-approved commands also run" (<https://code.claude.com/docs/en/permission-modes>).
- `acceptEdits` also auto-accepts `sed`, `LANG=C`, `NO_COLOR=1`, `timeout`, `nice`, `nohup`, and
  refuses to accept protected paths such as `rm`/`rmdir` targets (<https://code.claude.com/docs/en/permission-modes>).

### 1.3 Remembered approvals — where they are written

| Surface | What "don't ask again" writes | Scope | Source |
| --- | --- | --- | --- |
| Bash command | `allow` rule | `.claude/settings.local.json` at git repo root; survives future sessions across the repo incl. subdirs/worktrees | [permissions](https://code.claude.com/docs/en/permissions) |
| WebFetch domain / WebSearch | `allow` rule | Same repo-root local file | [permissions](https://code.claude.com/docs/en/permissions) |
| File modification | nothing saved | Session only | [permissions](https://code.claude.com/docs/en/permissions) |
| Desktop browser site | — | **Always allow** "saves the approval for that site on your device", revocable in Settings; each subdomain needs its own | [desktop](https://code.claude.com/docs/en/desktop) |
| Desktop app/computer use | — | Choice is **Allow for this session** or **Deny**; Dispatch-spawned sessions expire after 30 minutes | [desktop](https://code.claude.com/docs/en/desktop) |

- Prompts show a persistent option "only when the prompt can show you everything they would allow"
  (<https://code.claude.com/docs/en/permissions>).
- An `allow` rule in `.claude/settings.local.json` "doesn't outrank an `ask` rule from a project or
  managed file" (<https://code.claude.com/docs/en/settings>).
- `allow` rules in a project file are gated by workspace trust; `deny` and `ask` rules "apply right
  away" (<https://code.claude.com/docs/en/settings>).

### 1.4 Rule syntax and precedence

- Shape: `Tool` or `Tool(specifier)`; examples `Bash(npm run build)`, `Read(./.env)`,
  `WebFetch(domain:example.com)`; `Bash(*)` ≡ `Bash` (<https://code.claude.com/docs/en/permissions>).
- Evaluation order: "deny, then ask, then allow. The first match in that order determines the
  outcome, and rule specificity doesn't change the order." A broad deny cannot be carved out by a
  narrower allow (<https://code.claude.com/docs/en/permissions>).
- A bare tool-name deny removes the tool from Claude's context entirely; a scoped deny leaves the
  tool available and blocks matching calls (<https://code.claude.com/docs/en/permissions>).
- Bash wildcard placement matters: `Bash(git log *)` limits to `git log`; `Bash(git *)` allows every
  git command; `:*` is the same as a trailing ` *` (<https://code.claude.com/docs/en/permissions>).
- Compound Bash commands must have every subcommand match independently; wrappers `timeout`, `time`,
  `nice`, `nohup`, `stdbuf`, `command`, `builtin`, bare `xargs` are stripped before matching
  (<https://code.claude.com/docs/en/permissions>).
- `deny`/`ask` rules support input-parameter matching (`Tool(param:value)`, e.g. `Agent(model:opus)`)
  and tool-name globs such as `mcp__*`; allow globs need a literal `mcp__<server>__` prefix
  (<https://code.claude.com/docs/en/permissions>).

### 1.5 Settings locations and precedence

| Level | File | Source |
| --- | --- | --- |
| Managed | `managed-settings.json`, MDM, or claude.ai console | [settings](https://code.claude.com/docs/en/settings) |
| Command line | `claude --settings` | [settings](https://code.claude.com/docs/en/settings) |
| Project local | `.claude/settings.local.json` (personal overrides) | [settings](https://code.claude.com/docs/en/settings) |
| Shared project | `.claude/settings.json` (committed) | [settings](https://code.claude.com/docs/en/settings) |
| User | `~/.claude/settings.json` (all projects on machine) | [settings](https://code.claude.com/docs/en/settings) |

- List keys (`permissions.allow` etc.) merge across levels rather than replace
  (<https://code.claude.com/docs/en/settings>).
- `permissions.defaultMode` values `auto` and `bypassPermissions` "don't take effect from project or
  local settings" — set them in user or managed settings, or pass `--permission-mode`
  (<https://code.claude.com/docs/en/settings>).
- Desktop: a mode picked in the selector "is remembered per folder and takes precedence over
  `defaultMode` for that folder, except Plan, which applies to the current session only"
  (<https://code.claude.com/docs/en/desktop>).

## 2. OpenAI Codex CLI / ChatGPT desktop

### 2.1 Current model: two orthogonal axes

The current design is not a single mode ladder but `sandbox` (what is technically possible) ×
`approval_policy` (when it must stop and ask) (<https://learn.chatgpt.com/docs/agent-approvals-security>).

| Axis | Values | Meaning | Source |
| --- | --- | --- | --- |
| `--sandbox` / `sandbox_mode` | `read-only` | No writes; commands allowed inside read-only sandbox | [approvals](https://learn.chatgpt.com/docs/agent-approvals-security) |
| | `workspace-write` | Writes limited to workspace (+ `/tmp`); network off by default | [approvals](https://learn.chatgpt.com/docs/agent-approvals-security) |
| | `danger-full-access` | No sandbox | [approvals](https://learn.chatgpt.com/docs/agent-approvals-security) |
| `--ask-for-approval` / `approval_policy` | `on-request` | Codex pauses at sandbox boundaries (edits outside workspace, network, etc.) | [approvals](https://learn.chatgpt.com/docs/agent-approvals-security) |
| | `never` | Never prompts; works with all sandbox modes | [approvals](https://learn.chatgpt.com/docs/agent-approvals-security) |
| | `{ granular = { sandbox_approval, rules, mcp_elicitations, request_permissions, skill_approval } }` | Keep chosen prompt categories interactive, auto-reject others | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| | `untrusted` | **Retired/unsupported** — "Codex and ChatGPT Work no longer support `approval_policy = \"untrusted\"`"; can prevent startup | [approvals](https://learn.chatgpt.com/docs/agent-approvals-security) |
| | `on-failure` | Deprecated; use `on-request` or `never` | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| `approvals_reviewer` | `user` (default) / `auto_review` | Who reviews eligible prompts; auto_review uses a reviewer subagent | [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) |

- `read-only` + `on-request` is the documented migration path from the retired `untrusted` policy
  (<https://learn.chatgpt.com/docs/agent-approvals-security>).
- `--dangerously-bypass-approvals-and-sandbox` (alias `--yolo`) = no sandbox, no approvals
  (<https://learn.chatgpt.com/docs/agent-approvals-security>).
- Launch detection: version-controlled folder → recommends `Auto` (workspace-write + on-request);
  non-version-controlled → `read-only` (<https://learn.chatgpt.com/docs/agent-approvals-security>).
- Non-interactive: `codex exec --sandbox workspace-write`; `codex exec --full-auto` is kept as a
  "deprecated compatibility path" and prints a warning
  (<https://learn.chatgpt.com/docs/agent-approvals-security>).

### 2.2 Legacy preset names (repo history)

The first Codex CLI exposed one `--approval-mode` flag with three named presets
(<https://github.com/openai/codex/blob/rust-v0.2.0/README.md>):

| Legacy mode | May do without asking | Still requires approval |
| --- | --- | --- |
| **Suggest** (default) | Read any file in the repo | All file writes/patches; any arbitrary shell commands |
| **Auto Edit** | Read and apply-patch writes to files | All shell commands |
| **Full Auto** | Read/write files; execute shell commands (network disabled, writes limited to workdir) | — |

By rust-v0.20.0 the docs had moved to the `--sandbox` / `--ask-for-approval` pair and the README
still described "full-auto mode" and "approval mode" as config examples
(<https://github.com/openai/codex/blob/rust-v0.20.0/README.md>). Current docs no longer list
Suggest/Auto Edit/Full Auto. Older `--full-auto` invocations survive only as a deprecated alias in
`codex exec` (<https://learn.chatgpt.com/docs/agent-approvals-security>).

### 2.3 ChatGPT desktop app permission modes (same engine, different labels)

| UI mode | Notes | Source |
| --- | --- | --- |
| **Ask for approval** | Always available; "pauses before reaching beyond that boundary"; recommended default | [permission modes](https://learn.chatgpt.com/docs/permission-modes) |
| **Approve for me** | Called **Auto-review** in settings; same workspace boundary, requests to cross it go to automatic review | [permission modes](https://learn.chatgpt.com/docs/permission-modes) |
| **Full access** | Enabled per-user under Settings → General → Permissions | [permission modes](https://learn.chatgpt.com/docs/permission-modes) |

- Mode control sits "below the composer" in the desktop app / IDE extension; CLI uses `/permissions`
  (<https://learn.chatgpt.com/docs/permission-modes>).
- Enabling a mode in Settings only makes it available in the menu; it does not select it
  (<https://learn.chatgpt.com/docs/permission-modes>).
- Auto-review UI states: "Reviewing, Approved, Denied, Aborted, or Timed out", plus risk level and
  user-authorization assessment (<https://learn.chatgpt.com/docs/agent-approvals-security>).

### 2.4 Remembered approvals and admin rules

- Codex CLI command rules are `prefix_rule(pattern, decision, justification)` entries in `.rules`
  files under a `rules/` folder next to a config layer, e.g. `~/.codex/rules/default.rules`; project
  rules under `<repo>/.codex/rules/` load only when the project config layer is trusted
  (<https://learn.chatgpt.com/docs/agent-configuration/rules>).
- "When you add a command to the allow list in the TUI, Codex writes to the user layer at
  `~/.codex/rules/default.rules`" — so the remembered scope is the machine/user layer, not the
  conversation (<https://learn.chatgpt.com/docs/agent-configuration/rules>).
- Decisions are `allow`, `prompt`, `forbidden`; "Codex applies the most restrictive decision when
  more than one rule matches (`forbidden` > `prompt` > `allow`)"; `forbidden` blocks without asking
  and the `justification` "may surface it in approval prompts or rejection messages"
  (<https://learn.chatgpt.com/docs/agent-configuration/rules>).
- Rules are marked experimental (<https://learn.chatgpt.com/docs/agent-configuration/rules>).
- Protected paths remain read-only even in `workspace-write`: `<root>/.git`, `<root>/.agents`,
  `<root>/.codex`, recursively (<https://learn.chatgpt.com/docs/agent-approvals-security>).
- Network: `workspace-write` keeps network off unless `sandbox_workspace_write.network_access=true`;
  domain rules are allowlist-first with "deny always wins over allow"
  (<https://learn.chatgpt.com/docs/agent-approvals-security>).

## 3. Cursor / Windsurf / Cline / Zed / Gemini CLI (allow/deny UX shapes)

### 3.1 Cursor

| Item | Detail | Source |
| --- | --- | --- |
| Run Modes | **Auto-review** (allowlisted calls run immediately; other shell commands sandboxed when possible; rest go to a classifier), **Allowlist**, **Run Everything** | [run-modes](https://cursor.com/docs/agent/security/run-modes) |
| Deprecated modes | **Ask Every Time** deprecated in 3.5; **Run in Sandbox** folded into Allowlist + sandboxing; Auto-review became the recommended default in 3.6 | [run-modes](https://cursor.com/docs/agent/security/run-modes) |
| Location | Settings → Agents → Approvals & Execution (desktop) | [run-modes](https://cursor.com/docs/agent/security/run-modes) |
| Config files | `~/.cursor/permissions.json` (all projects) and `<project>/.cursor/permissions.json` (one project, commit to share); merged when both exist; team dashboard config overrides both | [run-modes](https://cursor.com/docs/agent/security/run-modes) |
| Rules shape | Plain-English `autoRun.allow_instructions` / `autoRun.block_instructions`, not tool-glob rules | [run-modes](https://cursor.com/docs/agent/security/run-modes) |
| CLI tokens | `Shell(cmd)`, `Read(glob)`, `Write(glob)`, `WebFetch(domain)`, `Mcp(server:tool)` in `permissions.allow` / `permissions.deny`; "Deny rules take precedence over allow rules" | [CLI permissions](https://cursor.com/docs/cli/reference/permissions) |
| Extra gates | Browser Protection, File-Deletion Protection, External-File Protection can require approval even when the mode would run automatically | [run-modes](https://cursor.com/docs/agent/security/run-modes) |

### 3.2 Windsurf (now branded Devin Desktop in the docs)

| Item | Detail | Source |
| --- | --- | --- |
| Levels | **Disabled**, **Allowlist Only**, **Auto** (model judges safety, premium models only), **Turbo** (everything auto-executed except denylist) | [terminal](https://docs.windsurf.com/windsurf/terminal) |
| Location | Devin/Cascade Settings panel bottom-right; VS Code settings `windsurf.cascadeCommandsAllowList` / `windsurf.cascadeCommandsDenyList` | [terminal](https://docs.windsurf.com/windsurf/terminal) |
| Precedence | "The denylist takes precedence over the allowlist"; team lists merge with user lists | [terminal](https://docs.windsurf.com/windsurf/terminal) |
| Admin cap | Teams/Enterprise can set a maximum allowed auto-execution level; users pick any level up to it | [terminal](https://docs.windsurf.com/windsurf/terminal) |

### 3.3 Cline

- Auto Approve is **per-tool-category toggles**, not a mode ladder: Read project files, Read all
  files, Edit project files, Edit all files, Execute safe commands, Execute all commands, Use the
  browser, Use MCP servers, Enable notifications
  (<https://docs.cline.bot/features/auto-approve>).
- "Read all files" and "Edit all files" only extend the base toggle; with the base off they do
  nothing (<https://docs.cline.bot/features/auto-approve>).
- Commands are not classified by a fixed allowlist: "The model marks each command with a
  `requires_approval` flag based on the command and arguments. These are examples, not guarantees."
  (<https://docs.cline.bot/features/auto-approve>).
- YOLO mode auto-approves everything including "Mode transitions (Plan to Act)"; enabled in
  Settings → Features, with no confirmation dialog
  (<https://docs.cline.bot/features/auto-approve>).
- Remembered-approval scope is not documented on that page — **unverified**, omitted.

### 3.4 Zed

| Item | Detail | Source |
| --- | --- | --- |
| Setting | `agent.tool_permissions.default` = `"confirm"` (default), `"allow"`, `"deny"`; before v0.224.0 it was `agent.always_allow_tool_actions` (bool) | [tool-permissions](https://zed.dev/docs/ai/tool-permissions) |
| Per-tool rules | `tools.<name>.always_allow` / `always_deny` / `always_confirm`, each a list of regex `{ pattern, case_sensitive }` (Rust regex) | [tool-permissions](https://zed.dev/docs/ai/tool-permissions) |
| Tools matched | `terminal` (command string), `edit_file`/`write_file`/`delete_path`/`move_path`/`copy_path`/`create_directory` (paths), `fetch` (URL), `search_web` (query), `skill` (SKILL.md path), `mcp:<server>:<tool>` | [tool-permissions](https://zed.dev/docs/ai/tool-permissions) |
| Precedence | Built-in security rules > `always_deny` > `always_confirm` > `always_allow` > tool default > global default | [tool-permissions](https://zed.dev/docs/ai/tool-permissions) |
| UI prompt | Tool card menu: **Allow once** / **Deny once**, **Always for \<tool>**, **Always for \<pattern>** (pattern option only "when a safe pattern can be extracted"; MCP tools get tool-level only) | [tool-permissions](https://zed.dev/docs/ai/tool-permissions) |
| Built-ins | Hardcoded, non-overridable terminal blocks for recursive deletion of `/`, `~`, `$HOME`, `.`, `..`, matched against raw and each sub-command | [tool-permissions](https://zed.dev/docs/ai/tool-permissions) |

### 3.5 Gemini CLI

| Item | Detail | Source |
| --- | --- | --- |
| Approval modes | `default` (prompt each call), `auto_edit` (auto-approve edit tools `replace`, `write_file`), `yolo` (all calls), `plan` (read-only; docs say "under development and not yet fully functional") | [configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) |
| Flags | `--approval-mode=<mode>`, `--yolo` (cannot combine with `--approval-mode`), `--allowed-tools` (comma list that bypasses confirmation) | [configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) |
| Settings | `general.defaultApprovalMode`; `security.disableYoloMode`; `security.disableAlwaysAllow` (kills "Always allow" options); `security.enablePermanentToolApproval` (enables "Allow for all future sessions", default `false`); `security.autoAddToPolicyByDefault` | [configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) |
| Policy engine | TOML rules with decisions `allow`, `deny`, `ask_user`; in non-interactive mode `ask_user` is treated as `deny`; rules can be scoped to approval modes (`yolo`, `autoEdit`, `plan`) | [policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md) |
| Remembered approval scope | Mode-aware: "Allow for all future sessions" includes the current mode and all more permissive modes (`plan` < `default` < `autoEdit` < `yolo`); a `default`-mode approval applies to `default`, `autoEdit`, `yolo` | [policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md) |
| Denial feedback | Rules can carry `denyMessage` shown to the user/model (example: `"Deletion is permanent"`) | [policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md) |

## 4. Synthesis

### 4.1 The common four-level ladder

Every product surveyed settles into the same four rungs, whatever the labels:

| Rung | Claude Code | Codex | Cursor | Gemini CLI | Windsurf | Zed |
| --- | --- | --- | --- | --- | --- | --- |
| Read-only | `plan` | `read-only` sandbox | not documented | `plan` (docs: under development) | not documented | not documented |
| Ask every write | `default` | `on-request` | Allowlist / Auto-review | `default` | Disabled / Allowlist Only | `default: "confirm"` |
| Auto-edit, commands ask | `acceptEdits` | granular prompt categories + per-command rules | not documented (mode is global, not edit-specific) | `auto_edit` | not documented | per-tool `always_allow` patterns |
| Full access | `bypassPermissions` | `never` + `danger-full-access` | Run Everything | `yolo` | Turbo | `default: "allow"` |
| Auto-review by classifier | `auto` | `approvals_reviewer = "auto_review"` | Auto-review | not documented | Auto | not documented |

Sources: [Claude modes](https://code.claude.com/docs/en/permission-modes), [Codex approvals](https://learn.chatgpt.com/docs/agent-approvals-security), [Cursor](https://cursor.com/docs/agent/security/run-modes), [Gemini](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md), [Windsurf](https://docs.windsurf.com/windsurf/terminal), [Zed](https://zed.dev/docs/ai/tool-permissions).

Two orthogonal axes recur: something like *sandbox* (what is technically reachable) and *approval*
(when a human is asked) — Codex names this explicitly, and Cursor's sandbox is "a layer on top of
Run Modes", while Claude Code has a separate Bash sandbox plus permission modes
([Codex](https://learn.chatgpt.com/docs/agent-approvals-security), [Cursor](https://cursor.com/docs/agent/security/run-modes), [Claude](https://code.claude.com/docs/en/permissions)).

Rule precedence converges on **deny > ask/confirm > allow**: Claude Code ("deny, then ask, then
allow"), Cursor CLI ("Deny rules take precedence over allow rules"), Zed, Codex
(`forbidden` > `prompt` > `allow`)
([Claude](https://code.claude.com/docs/en/permissions), [Cursor](https://cursor.com/docs/cli/reference/permissions), [Zed](https://zed.dev/docs/ai/tool-permissions), [Codex](https://learn.chatgpt.com/docs/agent-configuration/rules)).

### 4.2 Design questions a new app must answer (with the precedents)

| Question | Precedents to pick from |
| --- | --- |
| Default scope: per-workspace or per-conversation? | Claude Code: mode can be set per project (`.claude/settings.json`) but a desktop mode picked in-session is "remembered per folder"; Plan is current-session only. Gemini: `defaultApprovalMode` in settings file (machine) with CLI override. Codex: per-project config plus per-run flags. |
| What does "always allow" attach to? | Claude Code: rule (tool + argument pattern) written to repo-local settings; file edits are session-only. Codex: `prefix_rule` written to the **user** rules layer. Cursor: user-level or project-level `permissions.json`, team config wins. Zed: tool-level or pattern-level in settings. Gemini: mode-grained persisted approvals. |
| How is a deny reported to the model? | Claude Code attaches the comment "as denial reason for No". Codex `forbidden` justification "may surface ... in rejection messages". Gemini `denyMessage`. Without one of these, the deny is a bare failure the model must guess at. |
| Is the active mode visible in the UI? | Claude Code CLI mode indicator strings (`⏸ manual mode on`, `⏵⏵ accept edits on`, `⏸ plan mode on`, `⏵⏵ auto mode on`, `⏵⏵ don't ask on`, `⏵⏵ bypass permissions on`); Desktop selector next to send button; ChatGPT desktop control below the composer; Cursor/Cline/Zed settings panels. Precedent favors a persistent, always-visible indicator. |
| Can a stricter level override a looser one mid-session? | Claude Code: `deny` at any settings level cannot be overridden by an allow. Cursor: team config overrides user/project. Windsurf: denylist beats allowlist, admin caps the max level. Gemini: `security.disableYoloMode`/`disableAlwaysAllow`. |
| What happens to remembered approvals for edits? | Every product treats edit approvals as the weakest remembered grant: Claude Code makes file-modification approval last "until session end", while Bash/WebFetch/WebSearch persist per repository. Zed and Cursor persist pattern rules for writes too, so there is no consensus beyond "commands persist longer than edits" in Claude. |
| Is there a read-only planning rung that still executes shell reads? | Claude Code plan runs "read-only shell commands to explore"; Gemini's `plan` is read-only but flagged unfinished; Codex `read-only` sandbox allows read commands without approval. |

### 4.3 Notes for Alpha

- Alpha's four levels (`plan`, `ask`, `accept-edits`, `full-access`) map cleanly onto the convergent
  ladder; the classifier rung (`auto` / Auto-review) is the only common fifth state Alpha does not
  have, and both Claude and Cursor explicitly warn it "is not a security boundary"
  (<https://cursor.com/docs/agent/security/run-modes>, <https://code.claude.com/docs/en/permission-modes>).
- All surveyed apps write remembered approvals to a **file-backed rule store** rather than a hidden
  session database, and all let admins pin a stricter ceiling; that is the design Alpha's
  "Permission Rule" (per `CONTEXT.md`) should match.

## Sources

- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/desktop
- https://learn.chatgpt.com/docs/agent-approvals-security
- https://learn.chatgpt.com/docs/permission-modes
- https://learn.chatgpt.com/docs/agent-configuration/rules
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://github.com/openai/codex/blob/rust-v0.2.0/README.md
- https://github.com/openai/codex/blob/rust-v0.20.0/README.md
- https://cursor.com/docs/agent/security/run-modes
- https://cursor.com/docs/cli/reference/permissions
- https://docs.windsurf.com/windsurf/terminal
- https://docs.cline.bot/features/auto-approve
- https://zed.dev/docs/ai/tool-permissions
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
