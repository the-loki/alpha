# Agent desktop UI patterns

Primary-source survey of concrete UI decisions in shipping agent apps, 2026-09-18. Every claim is
cited to the product's own docs/changelog. Claims from direct observation of an official screenshot
are marked **[direct observation]**; anything I could not verify is marked **not documented** and
kept out of the recommendations.

## What became of this

The design pass it was written for happened, and it settled on a reference pair this survey does not
name — Linear and Raycast, recorded in [ADR-0027](../adr/0027-caliper-design-language.md) and
binding in [05-design.md](../constraints/05-design.md). §2's reading of which products Alpha
resembles is therefore superseded; the observations below are still what they were, evidence about
those products.

Taken: a level indicator visible at all times, an approval card carrying the exact command with a
scoped "always allow", remembered rules that are listed and revocable, a queue rather than a forced
interrupt, a denial that carries its reason back to the model, and thinking collapsed above the
answer with its own duration.

Not taken: the side panel for work-in-progress state and the diff panel beside the conversation —
nothing floats over the page (C5.4), and a diff is drawn inside the tool row that produced it — and
the one-key approve/decline pair, since `Enter` allows once while `Escape` only moves focus away
(C5.7).

## 1. ChatGPT desktop app

### 1.1 Sidebar and conversation list

| Element | Observed behavior | Source |
| --- | --- | --- |
| Sidebar contents | "The **Projects** view brings ChatGPT projects and local projects into one place"; one illustration is captioned "ChatGPT desktop app showing multiple projects in the sidebar and chats in the main pane" | [projects](https://learn.chatgpt.com/docs/projects) |
| Project / chat pinning | "Pin a project to keep it near the top of the sidebar"; "Pin a chat when you return to it often, even if newer chats appear in the project"; pinning only changes placement, not context | [projects](https://learn.chatgpt.com/docs/projects) |
| Conversation search | "Open **Search chats** from the sidebar"; no default shortcut, assign under Settings → Keyboard Shortcuts | [projects](https://learn.chatgpt.com/docs/projects) |
| Archiving | Archive a chat; "Archive chats" from a project menu archives together; restore from Settings → Archived chats | [projects](https://learn.chatgpt.com/docs/projects) |
| Shortcuts | Toggle sidebar `⌘B`; archive `⌘⇧A`; mark unread `⌘⇧U`; pin/unpin `⌘⌥P`; rename `⌘⌥R`; next chat needing attention `⌘⌥A` (Codex); open recent chat 1–6 `⌘⌥1–6` | [commands](https://learn.chatgpt.com/docs/reference/commands) |
| Notifications | A bell in the sidebar surfaces "work that needs your attention" | [what's new](https://learn.chatgpt.com/docs/whats-new) |
| Chat mode switch | "use the toggle above the composer to select Chat or Work"; `⌃1`/`⌃2`/`⌃3` switch Chat/Work/Codex | [app](https://learn.chatgpt.com/docs/app), [commands](https://learn.chatgpt.com/docs/reference/commands) |

Message layout widths and typography are **not documented** in the sources reviewed — no claim made.

### 1.2 Composer

| Behavior | Detail | Source |
| --- | --- | --- |
| Send | Enter sends; a "Quick chat" icon sits to the right of New chat for throwaway chats | [app](https://learn.chatgpt.com/docs/app) |
| Draft recall | `↑` restores the previous composer prompt when the composer is empty | [commands](https://learn.chatgpt.com/docs/reference/commands) |
| Context insertion | `@` menu lists enabled skills; model and reasoning commands are available while drafting; iOS release notes say the composer "now suggests installed plugins and their skills consistently with the desktop app" | [what's new](https://learn.chatgpt.com/docs/whats-new) |
| Model picker | `⌃⇧M` opens the model picker from the app | [commands](https://learn.chatgpt.com/docs/reference/commands) |
| Approval handling | When an approval request is open: "Approve request" = `⏎`, "Decline request" = `Esc` | [commands](https://learn.chatgpt.com/docs/reference/commands) |
| Attachments / files | `⌘O` open folder (Codex/Work); `⌘P` search files; `⌘⇧E` toggle file tree | [commands](https://learn.chatgpt.com/docs/reference/commands) |

Composer auto-growth and Shift+Enter behavior are **not documented** in the reviewed sources.

### 1.3 Streaming, tool steps, and work-in-progress

- The app markets itself on parallel, long-running work: "Run projects in parallel … keep long-running
  work moving from one desktop workspace" ([app](https://learn.chatgpt.com/docs/app)).
- While a task runs, the **chat sidebar** becomes the progress surface: "It can surface the agent's
  plan, sources, generated files, and chat summary so you can steer the work, inspect generated
  files, and request another pass" ([artifacts viewer](https://learn.chatgpt.com/docs/artifacts-viewer)).
- `⌘⌥U` toggles an **Activity view** when available ([commands](https://learn.chatgpt.com/docs/reference/commands)).
- Codex view adds a bottom panel (`⌘J`), terminal (`⌃\``), review tab (`⌃⇧G`), review panel (`⌘⌥B`),
  browser panel (`⌘⇧B`) ([commands](https://learn.chatgpt.com/docs/reference/commands)).
- Diff presentation in the desktop app: "inline editing in diffs, pull request review in the side
  panel" ([what's new](https://learn.chatgpt.com/docs/whats-new)). The April in-app review experience
  added "collapsible inline comments, inline and detached review modes, and clearer Git and source
  context" ([what's new](https://learn.chatgpt.com/docs/whats-new)). On iOS Remote, the June release
  added "expand-and-collapse controls for diffs" and "line wrapping for diffs"
  ([what's new](https://learn.chatgpt.com/docs/whats-new)).
- Chat actions inside Codex: `/diff` shows the Git diff including untracked files; `/side` starts a
  side chat without interrupting the main chat; `Esc` twice on an empty composer edits the previous
  user message and forks the chat from that point; `/status` shows chat ID, context usage, and rate
  limits; `/approve` approves one retry of an auto-review denial
  ([CLI/desktop commands](https://learn.chatgpt.com/docs/developer-commands)).

Regenerate/edit-message buttons in the ChatGPT chat view are **not documented** in the reviewed
sources; the documented equivalents are the Codex fork-from-message and `/fork` chat copy behaviors
([developer commands](https://learn.chatgpt.com/docs/developer-commands)).

## 2. Claude desktop

Claude has two desktop surfaces with different UIs: the Claude chat app (artifacts, thinking) and
Claude Code Desktop (the agent workbench). Both are covered because Alpha is closer to the latter
but borrows display patterns from the former.

### 2.1 Claude chat app

| Element | Detail | Source |
| --- | --- | --- |
| Composer layout | Rounded input box, placeholder "Type / for commands"; "+" button at lower left; model selector at lower right ("Opus 4.5" with a chevron); circular up-arrow send button at far right | **[direct observation]** official screenshot in [Get started with Claude](https://support.claude.com/en/articles/8114491-get-started-with-claude) |
| Model / effort / thinking controls | "The model menu next to the send button controls three settings": model, effort, and whether it uses thinking | [model/effort/thinking](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings) |
| Side panel | "When Claude creates an artifact, you'll see the content displayed in a dedicated window to the right of the main chat"; artifact window has a version selector and lower-right actions to view code, copy, and download | [artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them) |
| Artifact library | A dedicated **Artifacts** section in the Claude sidebar; in the new experience everything you make lands there automatically | [artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them) |
| Thinking display | A "Thinking" indicator **with a timer**, then an expandable "Thinking" section **above** the response; clicking it shows the thought-process summary; when safety systems cut it short the UI says the rest is not available | [model/effort/thinking](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings) |
| Usage limits | Claude "will notify you when you've reached your limit" | [get started](https://support.claude.com/en/articles/8114491-get-started-with-claude) |

Typography choices and empty states are **not documented** in the reviewed sources — no claim made.

### 2.2 Claude Code Desktop (agent session UI)

| Element | Detail | Source |
| --- | --- | --- |
| Session sidebar | "The sidebar lists your sessions and lets you run several in parallel"; each session has its own chat history and project folder | [desktop](https://code.claude.com/docs/en/desktop) |
| Pane system | Panes for chat, diff, browser, terminal, file, plan, tasks, and subagent (plus iOS Simulator on macOS); dragged by header, resized by edge, `Cmd+\` closes the focused pane, panes can pop out into their own windows | [desktop](https://code.claude.com/docs/en/desktop) |
| Diff review | A diff stats indicator appears when files change, e.g. `+12 -1`; clicking opens a viewer with a file list on the left and the selected file's changes on the right; click any line to open a comment box and submit comments as a batch; a **Review code** button asks Claude to review the diff | [desktop](https://code.claude.com/docs/en/desktop) |
| Stop affordance | A **stop button** interrupts immediately; alternatively typing a correction and pressing Enter sends it without stopping the running action | [desktop](https://code.claude.com/docs/en/desktop) |
| Permission control | The permission mode selector sits "next to the send button"; keyboard `Cmd+Shift+M` opens the permission mode menu | [desktop](https://code.claude.com/docs/en/desktop) |
| Permission cards | External site: **Allow once / Always allow / Deny**; computer use: **Allow for this session / Deny**, with an extra warning for broad-reach apps such as terminals and System Settings | [desktop](https://code.claude.com/docs/en/desktop) |
| Terminal pane | Integrated terminal opens in the session's working directory, supports tabs, shares the environment Claude uses | [desktop](https://code.claude.com/docs/en/desktop) |
| Keyboard map | `Cmd+Shift+D` toggle diff pane, `Cmd+Shift+B` toggle Browser pane, `Ctrl+\`` toggle terminal, `Cmd+\` close focused pane | [desktop](https://code.claude.com/docs/en/desktop) |

## 3. Claude Code terminal UI (the ZCode-style transcript)

### 3.1 Tool call display

- `Ctrl+O` toggles the **transcript viewer**: "Shows detailed tool usage and execution, with a
  timestamp and the model used on each assistant message. Also expands lines that collapse by
  default, such as MCP calls, shown as a single `Called slack 3 times` line, and messages from your
  other sessions, shown as a one-line `Message from @<sender>` preview"
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).
- Background subagent permission prompts surface in the main session, "the prompt names which
  subagent is asking, and pressing Esc denies that one tool call without stopping the subagent"
  ([tools reference](https://code.claude.com/docs/en/tools-reference)).
- Long-running Bash can be backgrounded with `Ctrl+B`; output goes to a file retrievable with the
  Read tool, tasks get unique IDs, and tasks are auto-terminated above 5GB of output
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).

### 3.2 Permission prompt anatomy

| Piece | Detail | Source |
| --- | --- | --- |
| Options | **Yes** / **No**, plus "Yes, and don't ask again" when the prompt "can show you everything they would allow"; dialogs with auto mode available also include "Yes, and switch to auto mode" | [permissions](https://code.claude.com/docs/en/permissions), [modes](https://code.claude.com/docs/en/permission-modes) |
| Comment on answer | Move to **Yes** or **No** and press `Tab` to open a comment field; Enter submits with the comment; Tab closes the field keeping the text. "WebFetch and browser prompts don't offer the field. The options that allow the action for the rest of the session or save a rule don't take one either." | [permissions](https://code.claude.com/docs/en/permissions) |
| Deny reason | The comment attached to **No** is delivered "as denial reason" | [permissions](https://code.claude.com/docs/en/permissions) |
| Keyboard | `Esc` on a permission prompt "declines the action, the same as **No** without a comment"; `Shift+Tab` on a file permission prompt selects the allow-for-the-rest-of-the-session option when offered | [interactive mode](https://code.claude.com/docs/en/interactive-mode) |
| Plan acceptance | Plan-ready prompt offers: "Yes, and use auto mode", "Yes, auto-accept edits", "Yes, and switch to BYPASS PERMISSIONS (no further prompts) for this session", "Yes, manually approve edits", "No, keep planning" | [modes](https://code.claude.com/docs/en/permission-modes) |
| Mode indicator | Persistent strings in the UI: `⏸ manual mode on`, `⏵⏵ accept edits on`, `⏸ plan mode on`, `⏵⏵ auto mode on`, `⏵⏵ don't ask on`, `⏵⏵ bypass permissions on`; `Shift+Tab` cycles them | [modes](https://code.claude.com/docs/en/permission-modes) |
| Idle timeouts | Permission prompts, including plan approval, "never auto-resolve on idle" | [tools reference](https://code.claude.com/docs/en/tools-reference) |

### 3.3 Diff presentation

- `/diff` reviews the working tree in-product; in **fullscreen rendering** it opens a **diff panel
  beside the conversation** that stays open and refreshes as Claude edits files; it lists changed
  files with added/removed line counts; it auto-opens once Claude starts editing "if your terminal
  is at least 144 columns wide", and remembers a manual close
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).
- In the classic renderer `/diff` opens a **diff viewer in place of the prompt**; it has a **Current**
  view (uncommitted changes) plus per-prompt **turn** views built from Claude's file edits; Enter
  opens a file's diff, Esc returns or closes
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).

### 3.4 Thinking, interrupt, queueing

| Behavior | Detail | Source |
| --- | --- | --- |
| Thinking toggle | `Option+T` (macOS) / `Alt+T` toggles extended thinking; no effect on models that always think | [interactive mode](https://code.claude.com/docs/en/interactive-mode) |
| Interrupt | `Esc` stops the current response or tool call mid-turn so you can redirect; "Claude keeps the work done so far" | [interactive mode](https://code.claude.com/docs/en/interactive-mode) |
| Ctrl+C ladder | First press interrupts a running operation; with nothing running, first press clears the prompt and a second exits | [interactive mode](https://code.claude.com/docs/en/interactive-mode) |
| Rewind | `Esc Esc` on an empty input opens the rewind menu to restore code/conversation from a previous point | [interactive mode](https://code.claude.com/docs/en/interactive-mode) |
| Queue while working | Typing + Enter while Claude works queues the message; queued entries are listed above the input box; `Up` from the first row takes them back; `Esc` interrupts and sends queued entries right away | [interactive mode](https://code.claude.com/docs/en/interactive-mode) |
| Direct shell | `!` prefix runs a command outside Claude's approval flow, adds output to the transcript, and Claude responds to it; exits on Escape/Backspace/Ctrl+U on empty input | [interactive mode](https://code.claude.com/docs/en/interactive-mode) |

How thinking content itself is rendered in the terminal is **not documented** in the reviewed pages;
only the toggle and the desktop/chat display are documented.

### 3.5 Token and cost display

- `/usage` shows a Session block with token statistics and a **Total cost** line, an "Usage by
  model" breakdown, and a prompt-cache line; the cost is computed locally from token counts at list
  price unless a `modelPricing` table applies; `/clear` resets totals
  ([costs](https://code.claude.com/docs/en/costs)).
- The status line has a cost field, compared against `--max-budget-usd`
  ([costs](https://code.claude.com/docs/en/costs)).

## 4. Codex CLI and Gemini CLI

### 4.1 Codex CLI / desktop Codex view

| Behavior | Detail | Source |
| --- | --- | --- |
| Transcript contents | "Steer the active turn, inspect commands and diffs as they appear, and keep follow-up work in the same session" | [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) |
| Diff command | `/diff`: "Review Codex's edits before you commit or run tests"; includes files Git isn't tracking yet | [developer commands](https://learn.chatgpt.com/docs/developer-commands) |
| Interrupt / steer | `Tab` while Codex is working queues a follow-up prompt, slash command, or shell command for the next turn; `Enter` while working injects new instructions into the **current** turn; `Esc` twice on an empty composer edits the previous user message and forks the chat | [developer commands](https://learn.chatgpt.com/docs/developer-commands) |
| Session status | `/status` shows chat ID, context usage, and rate limits; `/copy` (or `Ctrl+O`) copies the latest completed response | [developer commands](https://learn.chatgpt.com/docs/developer-commands) |
| Approval keyboard (desktop) | Approval request open: `⏎` approve, `Esc` decline | [commands](https://learn.chatgpt.com/docs/reference/commands) |
| Remembered approval UI | Adding a command to the allow list in the TUI writes a `prefix_rule` to `~/.codex/rules/default.rules`; decisions are `allow`/`prompt`/`forbidden` with justification text that "may surface ... in approval prompts or rejection messages" | [rules](https://learn.chatgpt.com/docs/agent-configuration/rules) |
| Diff affordances | Inline editing in diffs; expand-and-collapse controls for diffs; line wrapping for large diffs | [what's new](https://learn.chatgpt.com/docs/whats-new) |

Codex CLI's exact command-approval prompt text and its diff color scheme are **not documented** in
the reviewed sources.

### 4.2 Gemini CLI

| Behavior | Detail | Source |
| --- | --- | --- |
| Approval modes | `default`, `auto_edit` (auto-approves `replace`, `write_file`), `yolo`; `plan` read-only is documented as under development | [configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) |
| Confirmation dialog | Policy engine decisions `allow` / `deny` / `ask_user`; in non-interactive mode `ask_user` is treated as `deny`; denial can carry a `denyMessage` | [policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md) |
| Persistent approval UI | "**Allow for all future sessions**" option, off by default, enabled by `security.enablePermanentToolApproval`; admins can disable all "Always allow" options with `security.disableAlwaysAllow` | [configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) |
| Approval ergonomics | `ui.collapseDrawerDuringApproval` collapses the UI drawer while a confirmation is pending; `Esc`/`Ctrl+[` dismiss dialogs or cancel focus; `Ctrl+C` cancels the current request or quits when input is empty | [configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md), [shortcuts](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/keyboard-shortcuts.md) |
| Shell confirmations | The shell tool takes a `description` argument "shown to the user for confirmation"; output has a configurable pager (default `cat`); `Tab` focuses an interactive shell | [shell tool](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/shell.md) |
| Queueing | `Tab` queues the current prompt to run after the current task finishes; `Shift+Enter`/`Ctrl+Enter` insert a newline | [shortcuts](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/keyboard-shortcuts.md) |

Gemini CLI's diff rendering is **not documented** in the reviewed pages (the file-system tool doc has
no diff-display section).

## 5. Patterns worth stealing

Checklist, each item demonstrated by at least one shipping product:

- [ ] **Persistent mode indicator in the chrome, not only in a menu.** Claude Code renders
  `⏸ plan mode on` / `⏵⏵ accept edits on` etc. in the transcript
  ([modes](https://code.claude.com/docs/en/permission-modes)).
- [ ] **Mode selector adjacent to the send control.** Claude Desktop puts it "next to the send
  button" ([desktop](https://code.claude.com/docs/en/desktop)); ChatGPT puts its permissions control
  "below the composer" ([permission modes](https://learn.chatgpt.com/docs/permission-modes)).
- [ ] **Offer a persistent approval option only when the prompt can show its full scope.** Claude
  Code "offers those options only when the prompt can show you everything they would allow"
  ([permissions](https://code.claude.com/docs/en/permissions)).
- [ ] **Name the scope in the button.** Zed: "Always for \<tool>" / "Always for \<pattern>
  ([tool permissions](https://zed.dev/docs/ai/tool-permissions)); Claude computer use: "Allow for
  this session" ([desktop](https://code.claude.com/docs/en/desktop)).
- [ ] **Make remembered rules visible and revocable, and say where they are written.** Claude Desktop
  site approvals are revocable in Settings ([desktop](https://code.claude.com/docs/en/desktop));
  Codex writes TUI allow-list entries to `~/.codex/rules/default.rules`
  ([rules](https://learn.chatgpt.com/docs/agent-configuration/rules)); Cursor documents user vs
  project `permissions.json` ([run modes](https://cursor.com/docs/agent/security/run-modes)).
- [ ] **Collapse noisy repeated tool calls to one line, expandable on demand.** Claude Code:
  collapsed MCP calls read `Called slack 3 times`, expanded with `Ctrl+O`
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).
- [ ] **Diff panel with per-file +/- counts that live-refreshes beside the conversation.** Claude
  Code `/diff`; auto-opens at ≥144 columns ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).
- [ ] **One-key approve/decline on approval dialogs.** ChatGPT desktop: `⏎` approve, `Esc` decline
  ([commands](https://learn.chatgpt.com/docs/reference/commands)).
- [ ] **Define a consistent Esc ladder and document it.** Esc = interrupt; Esc on dialog = close;
  Esc on permission prompt = decline; Esc Esc = rewind
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).
- [ ] **Queue-while-working rather than forcing an interrupt.** Claude Code lists queued entries
  above the input and sends them at the right point in the turn
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)); Codex `Tab` queues for the
  next turn while `Enter` injects into the current one
  ([developer commands](https://learn.chatgpt.com/docs/developer-commands)).
- [ ] **Background long commands with retrievable output and a kill path.** Claude Code `Ctrl+B`,
  output to a file, task IDs, 5GB auto-terminate cap
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).
- [ ] **Use a side panel for work-in-progress state (plan, sources, generated files, summary).**
  ChatGPT chat sidebar during a run
  ([artifacts viewer](https://learn.chatgpt.com/docs/artifacts-viewer)); Claude Code Desktop panes
  for plan/tasks/subagent ([desktop](https://code.claude.com/docs/en/desktop)).
- [ ] **Let a denial carry a reason back into the model.** Claude's comment on "No" is delivered as
  the denial reason ([permissions](https://code.claude.com/docs/en/permissions)); Codex
  `justification` and Gemini `denyMessage` serve the same role
  ([rules](https://learn.chatgpt.com/docs/agent-configuration/rules),
  [policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)).
- [ ] **Show thinking as an indicator-with-timer plus an expandable section above the answer.** Claude
  chat's "Thinking" indicator and section
  ([model/effort/thinking](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)).
- [ ] **Surface token/cost in a command and the status line.** Claude Code `/usage` session block and
  status-line cost ([costs](https://code.claude.com/docs/en/costs)).
- [ ] **Treat the mode hierarchy as data for remembered approvals.** Gemini's persisted approval
  includes the current mode and all more permissive modes (`plan` < `default` < `autoEdit` < `yolo`)
  ([policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)).

## 6. Anti-patterns observed

- **Modes that exist but are not in the cycle.** Claude Code's `Shift+Tab` cycle omits `auto`,
  `bypassPermissions`, and `dontAsk` unless available, and `dontAsk` is CLI-only. A user can be in a
  mode they never see offered ([modes](https://code.claude.com/docs/en/permission-modes),
  [desktop](https://code.claude.com/docs/en/desktop)).
- **Same key, different meanings.** In Claude Code, `Esc` on a permission prompt means decline, while
  elsewhere it means interrupt; `Ctrl+C` interrupts or clears depending on state. The docs spend a
  table on this, which is evidence the semantics are hard to hold in the head
  ([interactive mode](https://code.claude.com/docs/en/interactive-mode)).
- **Remembered-approval scope is inconsistent across tool classes.** Claude Code persists Bash,
  WebFetch, and WebSearch approvals "permanently per repository" but file-modification approvals
  only "until session end", so a user cannot assume "don't ask again" behaves uniformly
  ([permissions](https://code.claude.com/docs/en/permissions)).
- **Automation presented as safety.** Cursor states plainly that Auto-review's classifier "is not a
  security boundary" and can allow or block the wrong calls
  ([run modes](https://cursor.com/docs/agent/security/run-modes)); Claude says auto mode "reduces
  permission prompts but does not guarantee safety"
  ([modes](https://code.claude.com/docs/en/permission-modes)). A UI that presents these as safe
  defaults without that caveat is misleading.
- **All-or-nothing escalation without guardrails.** Cline's YOLO mode has "No confirmation dialogs"
  and auto-approves everything including mode transitions
  ([auto approve](https://docs.cline.bot/features/auto-approve)); Cursor's Run Everything "runs
  automatically" with no classifier ([run modes](https://cursor.com/docs/agent/security/run-modes));
  Codex labels its equivalent "not recommended"
  ([approvals](https://learn.chatgpt.com/docs/agent-approvals-security)).
- **Unbounded tool output handled late.** Claude Code only auto-terminates background tasks after
  5GB of output ([interactive mode](https://code.claude.com/docs/en/interactive-mode)); Gemini CLI
  defaults its shell pager to `cat`, i.e. a full dump
  ([shell tool](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/shell.md)). Truncate
  and summarize at the renderer instead.
- **Denials with no explanation to the model.** The products that handle this well all have an
  explicit channel (Claude's answer comment, Codex `justification`, Gemini `denyMessage`); a bare
  rejection is the pattern to avoid
  ([permissions](https://code.claude.com/docs/en/permissions),
  [rules](https://learn.chatgpt.com/docs/agent-configuration/rules),
  [policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)).

## Sources

- https://learn.chatgpt.com/docs/app
- https://learn.chatgpt.com/docs/projects
- https://learn.chatgpt.com/docs/artifacts-viewer
- https://learn.chatgpt.com/docs/reference/commands
- https://learn.chatgpt.com/docs/whats-new
- https://learn.chatgpt.com/docs/developer-commands
- https://learn.chatgpt.com/docs/codex/cli
- https://learn.chatgpt.com/docs/permission-modes
- https://learn.chatgpt.com/docs/agent-approvals-security
- https://learn.chatgpt.com/docs/agent-configuration/rules
- https://support.claude.com/en/articles/8114491-get-started-with-claude
- https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings
- https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/tools-reference
- https://code.claude.com/docs/en/costs
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/keyboard-shortcuts.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
- https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/shell.md
- https://cursor.com/docs/agent/security/run-modes
- https://docs.cline.bot/features/auto-approve
- https://zed.dev/docs/ai/tool-permissions
