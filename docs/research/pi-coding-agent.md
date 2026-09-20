# Driving the pi coding agent from another process

Researched 2026-09-20 from `@earendil-works/pi-coding-agent` **0.86.0**, installed from npm, by
reading its own documentation and README. Every claim below cites the file inside that package
(`docs/…`, `README.md`); nothing here comes from the model's memory of similar tools.

This is the reference for Alpha's integration with pi: Alpha installs nothing, ships nothing of
pi, and talks to the `pi` the user installed.

## What pi is, and how a host talks to it

> Pi is a minimal terminal coding harness… Pi runs in four modes: interactive, print or JSON, RPC
> for process integration, and an SDK for embedding in your own apps. — `README.md`

| Mode | How a host uses it |
| --- | --- |
| interactive | A human in a terminal |
| `-p` / `--mode json` | One prompt, one answer, process exits |
| `--mode rpc` | **A long-lived child process speaking JSONL over stdin/stdout** |
| SDK | `import { createAgentSession } from "@earendil-works/pi-coding-agent"` in the same process |

The SDK is the better choice for a Node host that bundles its own agent (`docs/rpc.md` says so in
a note at the top). RPC is the choice for a host that does **not** ship pi: it needs only the
user's `pi` on the machine, and pi's version is then the user's business, not Alpha's.

## Installing pi (what Alpha offers to do)

Both documented install paths, from `docs/index.md` and `docs/quickstart.md`:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
curl -fsSL https://pi.dev/install.sh | sh
```

`pi -v` / `--version` prints the version (`README.md` § CLI Reference). So detection is: is there
a `pi` on `PATH` (or at the path the user gave), and what does it answer to `--version`.

## RPC mode

### Starting it

```
pi --mode rpc [options]
```

Options that matter to a host (`README.md` § CLI Reference, `docs/rpc.md`):

| Flag | Meaning |
| --- | --- |
| `--provider <name>` / `--model <pattern>` | Which model to start on; a pattern may carry `provider/id:thinking` |
| `--name <name>` / `-n` | Session display name |
| `--session <path\|id>` | Resume one session file, or a partial session UUID |
| `--session-dir <dir>` | Where sessions are stored (overridden by nothing else but the flag) |
| `--fork <path\|id>` | Fork an existing session into a new one |
| `-e`, `--extension <source>` | Load an extension from a path, npm package, or git repo (repeatable) |
| `-a` / `--approve`, `-na` / `--no-approve` | Trust, or refuse, project-local resources for this run |
| `--no-session` | Ephemeral: nothing is written |

### Framing

> RPC mode uses strict JSONL semantics with LF (`\n`) as the only record delimiter… Do not use
> generic line readers that treat Unicode separators as newlines. In particular, Node `readline` is
> not protocol-compliant for RPC mode because it also splits on `U+2028` and `U+2029`, which are
> valid inside JSON strings. — `docs/rpc.md` § Framing

So the reader splits on `\n` and strips a trailing `\r`. `readline` is out.

- **Commands**: one JSON object per line to stdin.
- **Responses**: `{ "type": "response", … }` on stdout — success or failure.
- **Events**: agent events streamed to stdout as JSON lines, interleaved with responses.
- An optional `id` on a command is echoed on its response; that is the only correlation.

### Commands a host needs

Grouped as `docs/rpc.md` groups them; the ones Alpha's window already has a place for are marked.

| Group | Commands | Alpha's feature |
| --- | --- | --- |
| Prompting | `prompt`, `steer`, `follow_up`, `abort`, `clear_queue`, `new_session` | send, Steer, Queue, Stop, cancel-queued, New |
| State | `get_state`, `get_messages` | the transcript after a relaunch |
| Model | `set_model`, `cycle_model`, `get_available_models` | the per-conversation model |
| Thinking | `set_thinking_level`, `cycle_thinking_level`, `get_available_thinking_levels` | the thinking effort |
| Queue modes | `set_steering_mode`, `set_follow_up_mode` | when a steer lands |
| Compaction | `compact`, `set_auto_compaction` | the compaction marker |
| Retry | `set_auto_retry`, `abort_retry` | provider hiccups |
| Bash | `bash`, `abort_bash` | a command run by hand |
| Session | `get_session_stats`, `export_html`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `get_entries`, `get_tree`, `get_last_assistant_text`, `set_session_name` | list, resume, fork, regenerate, edit, export |
| Commands | `get_commands` | pi's own slash commands |

A `prompt` while the agent is streaming must carry `streamingBehavior: "steer"` (or `"followUp"`)
— `docs/rpc.md` § prompt.

### Events

`agent_start`, `agent_end`, `agent_settled`, `turn_start`, `turn_end`, `message_start`,
`message_end`, `message_update` (streaming, with an `assistantMessageEvent` inside it),
`bash_execution_update`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`,
`queue_update` (carries `steering` and `followUp` as two separate lists), `compaction_start`,
`compaction_end`, `auto_retry_start`, `auto_retry_end`, the three summarization-retry events,
`extension_error` — `docs/rpc.md` § Events.

## The permission gate

Pi does not have a permission system of its own to configure. What it has is **extensions**, and a
`tool_call` hook that can block:

> Fired after `tool_execution_start`, before the tool executes. **Can block**… `event.input` is
> mutable. Mutate it in place to patch tool arguments before execution… Return values control
> blocking via `{ block: true, reason?: string, terminate?: boolean }`
> — `docs/extensions.md` § tool_call

An extension asks the human through its UI context, and in RPC mode those questions become a
sub-protocol on the same pipes:

> **Dialog methods** (`select`, `confirm`, `input`, `editor`): emit an `extension_ui_request` on
> stdout and block until the client sends back an `extension_ui_response` on stdin with the
> matching `id`. — `docs/rpc.md` § Extension UI Protocol

| Request (pid→host) | Shape | Host answers |
| --- | --- | --- |
| `confirm` | `{type:"extension_ui_request", id, method:"confirm", title, message?, timeout?}` | `{type:"extension_ui_response", id, confirmed: true\|false}` or `{…, cancelled: true}` |
| `select` | `{…, method:"select", title, options: string[], timeout?}` | `{…, value: "<option>"}` |
| `input` / `editor` | `{…, method:"input"\|"editor", title, placeholder?/prefill?}` | `{…, value: "<text>"}` |
| `notify` | `{…, method:"notify", message, notifyType: "info"\|"warning"\|"error"}` | nothing (fire and forget) |

A dialog may carry `timeout`; the agent-side resolves it with a default, so the host does not have
to track timers (`docs/rpc.md` § Extension UI Protocol). Methods that need a real terminal —
`custom()`, themes, footer/header widgets — are degraded or no-ops in RPC mode;
`ctx.mode === "rpc"` and `ctx.hasUI === true`.

So the gate is: Alpha writes its own extension, and every tool call pi makes arrives at Alpha as a
`confirm` request, answered by Alpha's own card. A refusal is `{confirmed: false}` → the extension
returns `{block: true, reason}`.

## Where pi keeps things, and who owns them

`PI_CODING_AGENT_DIR` overrides the config directory (`~/.pi/agent` by default), and it holds
settings, `models.json`, `auth.json`, sessions, and extensions
(`docs/environment-variables.md` § Pi Process Configuration, `docs/sdk.md` § Directories). A host
that wants the user's own pi untouched points that variable at its own directory.

Sessions are JSONL files under the session directory, organised by working directory, and they are
**trees**: every entry has an `id` and a `parentId`, the current position is the active leaf
(`docs/sessions.md` § Session Storage, § Branching with `/tree`; format in `docs/session-format.md`).

Model configuration: built-in providers take their key from the environment or `auth.json`, and a
provider that is not in pi's catalog is described in `models.json`/via `registerProvider`, where
`apiKey` may be `"$SOME_VARIABLE"` (`docs/custom-provider.md`, `docs/sdk.md` § API Keys and OAuth).

Environment variables worth setting for a local-first host
(`docs/environment-variables.md` § Pi Process Configuration):

| Variable | Value Alpha wants | Why |
| --- | --- | --- |
| `PI_OFFLINE` | `1` | "Disable startup network operations, including update checks, package updates, and install/update telemetry" |
| `PI_TELEMETRY` | `0` | No install/update telemetry, no provider attribution headers |
| `PI_SKIP_VERSION_CHECK` | `1` | No `pi.dev` version request |
| `PI_CODING_AGENT_DIR` | Alpha's own directory | The user's `~/.pi` stays as it is |

Pi also sets `AI_AGENT=pi` and `PI_CODING_AGENT=true` for the processes the shell tool spawns, and
injects `PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL`, `PI_REASONING_LEVEL` into
those shells (`docs/environment-variables.md`).

## Project trust

Non-interactive modes do not prompt: with no saved decision, `defaultProjectTrust: "ask"` means
project-local settings, extensions, skills and prompts are **ignored**, and a bare `.pi` directory
does not count as a resource that needs trust. `-a` trusts for one run, `-na` refuses. User/global
extensions load regardless of trust (`docs/security.md` § Project Trust).

Two consequences for Alpha: a gate extension placed in the user's global directory loads without
asking anyone, and pi has no sandbox — the tools run with the user's own permissions
(`docs/security.md` § No Built-in Sandbox). Alpha's permission ladder is therefore the only gate
there is, which is exactly what Alpha's constraints already require.

## Spike findings (2026-09-20, pi 0.86.0)

The claims above were then checked against a running `pi 0.86.0`, with a fake OpenAI-completions
endpoint on `127.0.0.1` as the model (so no credential was needed), an extension in the agent
directory, and a host process speaking the protocol. What was observed:

**The gate works end to end.** With an extension whose `tool_call` handler asks
`ctx.ui.confirm(...)`, asking the model to run a command produced, in this order:
`tool_execution_start` → `extension_ui_request{method:"confirm"}` → the host answered
`extension_ui_response{confirmed:false}` → `tool_execution_end` carrying the host's reason as an
**error result** → and on the model's next request the transcript contained that reason verbatim
as the tool result (`role: "tool"`). So a refusal reaches the model as a refusal, in Alpha's own
words — which is what the ledger's second half needs.

**A dialog raised from `session_start` makes pi exit.** Raising `ctx.ui.confirm` in a
`session_start` handler ended the process with code 0 while the dialog was still pending; an
extension that only calls `ctx.ui.notify` at startup stayed alive, and so did one that asks during
a run. Alpha's gate therefore hangs on `tool_call` (a run-time event), never on a startup event.

**Failures arrive as values.** With no API key configured, `prompt` answered
`{"type":"response","command":"prompt","success":false,"error":"No API key found for the selected
model…"}` and the process stayed alive and usable.

**A custom provider needs no catalog.** A `models.json` entry with `baseUrl`, `api:
"openai-completions"`, `apiKey: "$SOME_VARIABLE"` and one model id was enough to drive a run, with
the key taken from the child process's environment — which is how Alpha will pass a credential it
holds encrypted, without writing a secret to disk.

**Shapes seen in the stream.** Assistant content blocks are `{type: "toolCall", id, name,
arguments}` (the arguments field is `arguments`, not `args`); messages carry `api`, `provider`,
`model` and `usage`; a run ends `agent_end` then `agent_settled`; and the built-in tools pi offers
are `read`, `bash`, `edit`, `write` — the same four Alpha had.
