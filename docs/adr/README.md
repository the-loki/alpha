# Decisions

One file per decision that was expensive to reverse. Alpha keeps the two kinds apart on purpose: a
decision still in force binds the code today, and a superseded one keeps its file, its banner and its
reasoning — the history is worth more than a tidy list. This index is where the live set is visible
at a glance, and a test in `tools/docs/` keeps it true: every file listed once, every title the file's
own, every superseded decision pointing at what replaced it.

## In force

Two entries below are superseded *in part*: [0001](0001-agent-runtime-in-main-process.md) and
[0004](0004-transcripts-as-jsonl-entries.md) each carry a `Superseded in part` section naming what
[ADR-0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md) retired and what still
binds. They sit here rather than under Superseded because the half that remains is what the code
does today.

| # | Decision |
| --- | --- |
| [0001](0001-agent-runtime-in-main-process.md) | The agent runs in the main process |
| [0002](0002-four-level-permission-ladder.md) | Four permission levels, with interactive approvals and remembered rules |
| [0003](0003-byok-credentials-in-os-keychain.md) | BYOK credentials are encrypted with the OS keychain and never cross IPC in plaintext |
| [0004](0004-transcripts-as-jsonl-entries.md) | The transcript is a JSONL session on disk |
| [0007](0007-gate-decisions-beside-the-session.md) | The gate's decisions live in Alpha's own file, beside the session |
| [0008](0008-a-run-nobody-is-driving-is-over.md) | A run nobody is driving is over |
| [0009](0009-the-workbench-can-be-served-to-a-browser.md) | The workbench can be served to a browser, and the browser is a full operator |
| [0010](0010-the-interface-is-written-in-a-dictionary.md) | The interface is written in a dictionary, and only the interface |
| [0011](0011-the-queue-belongs-to-the-workbench.md) | The queue belongs to the workbench, not to the lane |
| [0012](0012-nothing-is-asked-when-nobody-is-watching.md) | Nothing is asked when nobody is watching |
| [0013](0013-the-clock-belongs-to-the-process.md) | The clock belongs to the process, and a missed run is caught up once |
| [0014](0014-an-attachment-is-bytes.md) | An attachment is bytes, and it rides inside the message |
| [0015](0015-three-protocols-and-no-catalog.md) | Three protocols, no catalog, and a model list that belongs to the user |
| [0018](0018-a-model-says-what-it-can-be-handed.md) | A model says what it can be handed |
| [0021](0021-the-window-is-solid.md) | The window is Solid |
| [0022](0022-a-live-run-may-reach-a-provider.md) | A live run may reach a provider |
| [0025](0025-the-agent-is-embedded-and-the-workbench-is-the-base.md) | The agent is embedded, and the workbench is the base |
| [0028](0028-an-mcp-server-is-reached-not-loaded.md) | An MCP server is reached, not loaded in |
| [0029](0029-a-subagent-is-one-tool-call.md) | A subagent is one tool call, and its work stays out of the conversation |
| [0027](0027-caliper-design-language.md) | Caliper: an instrument in near-neutral and indigo |

## Superseded

These still explain why the decision was made, and what replaced it. Follow the chain: a decision
may have been replaced by one that was itself replaced.

| # | Decision | Replaced by |
| --- | --- | --- |
| [0005](0005-ember-ink-design-language.md) | Ember Ink: a warm-ink, single-accent design language | [0026](0026-codex-design-language.md) |
| [0006](0006-tanstack-router-file-routes.md) | The renderer routes with TanStack Router's file-based routes | [0021](0021-the-window-is-solid.md) |
| [0016](0016-the-page-the-margin-and-the-stamp.md) | The page, the margin, and the stamp | [0026](0026-codex-design-language.md) |
| [0017](0017-soft-corners-and-the-page-stays.md) | Soft corners, and the page stays | [0026](0026-codex-design-language.md) |
| [0019](0019-a-display-voice.md) | A display voice: the person's words are set like print | [0026](0026-codex-design-language.md) |
| [0020](0020-glass-light-and-the-room-that-breathes.md) | Glass, light, and the room that breathes | [0026](0026-codex-design-language.md) |
| [0023](0023-iris-design-language.md) | Iris: a cool-porcelain, single-signal design language | [0026](0026-codex-design-language.md) |
| [0024](0024-spine-and-a-conversation.md) | The window is a spine, and the transcript is a conversation | [0026](0026-codex-design-language.md) |
| [0026](0026-codex-design-language.md) | Codex: paper, two inks, two voices | [0027](0027-caliper-design-language.md) |
