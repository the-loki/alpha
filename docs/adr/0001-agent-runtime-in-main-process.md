# Agent runtime lives in the Electron main process, built on pi-agent-core's harness

Alpha runs the agent in the Electron main process using `@earendil-works/pi-agent-core`'s
`AgentHarness`, and treats the renderer as a pure view fed by IPC events.

## Context

Three shapes were available: spawn the `pi` CLI in RPC mode and forward its JSONL, embed the
lower-level `Agent` class and hand-roll sessions and tools, or embed `AgentHarness` and get
sessions, tools, compaction, and hooks from the library.

## Considered options

- **`pi --mode rpc` subprocess.** Least code, but the permission model would have to be expressed
  through pi's own extension mechanism, the model catalog would live in pi's config file rather
  than Alpha's BYOK store, and every UI affordance would be bounded by pi's RPC protocol.
- **`Agent` class only.** Full control, but sessions, compaction, and the file/shell tool kit
  would all be rebuilt — the library already ships them behind `createAgentHarness`.
- **`AgentHarness` in-process** (chosen). The harness provides `hooks.on("before_tool")` for the
  permission gate, `JsonlSessionRepo` for persistence, `NodeExecutionEnv` for the real
  filesystem and shell, and the read/write/edit/bash tools — and an `AgentHarnessTool` is a
  plain TypeScript object, so Alpha's own tools need no adapter layer.

## Consequences

The renderer holds no model client and no credential; the API key never crosses IPC in
plaintext. Every new capability is an IPC contract entry plus a main-process handler, which is
more ceremony than calling a library directly from React — accepted, because it is the boundary
that keeps credentials and filesystem access out of the web context. The harness's
`watchSession` and public `drive` are not implemented in 0.85.1, so Alpha drives runs through
`lane.prompt`, `lane.resume`, and `lane.abort` rather than the snapshot API.
