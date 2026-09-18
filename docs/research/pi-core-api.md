# Research: the pi core API surface Alpha builds on

Primary sources: the TypeScript declaration files and READMEs of the packages installed from
`@earendil-works/*` at version **0.85.1**. Every signature below was read from a `.d.ts` in
`node_modules`, not from a blog or a summary. Line numbers are omitted deliberately; the file
names are given so a reader can re-check a claim.

## Packages and topology

| Package | Role |
| --- | --- |
| `@earendil-works/pi-ai` | Model/provider registry, wire-protocol clients, auth, streaming event protocol |
| `@earendil-works/pi-agent-core` | `Agent` class, `agentLoop`, `AgentHarness`, sessions, compaction, skills, built-in tools |
| `@earendil-works/pi-telemetry` | Vendor-neutral span/event contracts |
| `@earendil-works/chord` | Application-composition runtime; owns the `Context` type |

```
pi-telemetry  ←  pi-ai  ←  pi-agent-core  →(context types)→  chord
```

All four are ESM-only (`"type": "module"`, no `require` condition) and require Node
`>=22.19.0`. `pi-agent-core`'s root entry and `pi-ai`'s root entry import no Node builtins, so
they are safe to bundle for a browser; `NodeExecutionEnv` lives behind the `./node` subpath and
is the Node-only piece.

## Streaming

`StreamFn` is the seam between the runtime and the network (`pi-agent-core` `dist/types.d.ts`):

```ts
type StreamFn = (model: Model<Api>, context: Context, options?: SimpleStreamOptions) =>
  AssistantMessageEventStream | Promise<AssistantMessageEventStream>;
```

Its contract is explicit in the declaration: it must never throw or reject for a request,
model, or runtime failure — it returns a stream, and failures are encoded as protocol events
ending in an `AssistantMessage` whose `stopReason` is `"error"` or `"aborted"`.

`AssistantMessageEventStream extends EventStream<AssistantMessageEvent, AssistantMessage>` and
supports `for await`, `.push/.end/.result()`. `AssistantMessageEvent` is a discriminated union:
`start`, `text_start|text_delta|text_end`, `thinking_start|thinking_delta|thinking_end`,
`toolcall_start|toolcall_delta|toolcall_end`, `done`, `error`; `done`/`error` carry the full
`AssistantMessage`.

`setDefaultStreamFn(fn)` / `getDefaultStreamFn()` exist for callers that do not pass a stream
function explicitly.

## The `Agent` class (raw, no persistence)

```ts
new Agent({
  initialState?: Partial<AgentState>,   // systemPrompt, model, thinkingLevel, tools, messages
  convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>,
  transformContext?: (messages, signal?) => Promise<AgentMessage[]>,
  streamFn: StreamFn,                   // required
  getApiKey?: (provider: string) => Promise<string|undefined> | string | undefined,
  beforeToolCall?: (ctx: BeforeToolCallContext, signal?) => Promise<BeforeToolCallResult | undefined>,
  afterToolCall?: (ctx: AfterToolCallContext, signal?) => Promise<AfterToolCallResult | undefined>,
  shouldStopAfterTurn?, prepareNextTurn?, steeringMode?, followUpMode?,
  sessionId?, thinkingBudgets?, transport?, maxRetryDelayMs?, toolExecution?
})
```

State is read and written through `agent.state` (`systemPrompt`, `model`, `thinkingLevel`,
`tools`, `messages`, plus read-only `isStreaming`, `streamingMessage`, `pendingToolCalls`,
`errorMessage`). Assigning `state.tools` or `state.messages` copies the top-level array.

Methods: `subscribe(listener) => unsubscribe`, `prompt(text | AgentMessage, images?)`,
`continue()`, `steer(msg)`, `followUp(msg)`, `clearSteeringQueue()`, `clearFollowUpQueue()`,
`clearAllQueues()`, `hasQueuedMessages()`, `abort()`, `waitForIdle()`, `reset()`,
`signal` getter.

Agent events (`AgentEvent`): `agent_start`, `agent_end{messages}`, `turn_start`,
`turn_end{message,toolResults}`, `message_start{message}`, `message_update{message,
assistantMessageEvent}`, `message_end{message}`, `tool_execution_start{toolCallId,toolName,args}`,
`tool_execution_update{...,partialResult}`, `tool_execution_end{...,result,isError}`.

Listeners are awaited in registration order, and `agent_end` is the final event for a run.
`isStreaming` stays true until awaited `agent_end` listeners finish.

Tool definition (`AgentTool`) carries `name`, `label`, `description`, `parameters` (TypeBox
schema), `execute(toolCallId, params, signal?, onUpdate?)`, optional `executionMode`.
**A tool signals failure by throwing**, not by returning error content; the loop catches the
throw and reports it to the model with `isError: true`.

## Permission hooks

Two equivalent paths exist; Alpha uses the harness hook.

```ts
interface BeforeToolCallResult { block?: boolean; reason?: string; terminate?: boolean; }
interface BeforeToolCallContext {
  assistantMessage: AssistantMessage;
  toolCall: AgentToolCall;
  args: unknown;            // already validated against the tool's schema
  context: AgentContext;
}
```

On the harness: `harness.hooks.on("before_tool", handler, { id? }) => unsubscribe`, where the
handler receives `{ toolCallId, toolName, args }` and may return
`{ args?, block?: { reason, terminate? } }`. `before_tool` runs after argument validation and
after `tool_execution_start`; `after_tool` runs before `tool_execution_end` and may replace
content, details, isError, and usage.

`terminate: true` only ends the run when *every* tool result in the batch sets it.

## The harness (persistence, tools, events)

```ts
const { harness, open } = await createAgentHarness({
  session, models, model, thinkingLevel?, activeToolNames?, tools?, toolContext?,
  systemPrompt?, resources?, streamOptions?, retry?, compaction?, steeringMode?,
  followUpMode?, toolExecution?, toProviderMessages?, entryProjectors?,
}, context);
```

`context` is a `chord` `Context`; `BACKGROUND_CONTEXT` re-exported by `pi-agent-core` is the
root value to pass when the app has no request context of its own.

Lane operations Alpha uses:

```ts
lane.prompt(text, images, context): Promise<RunResult>
lane.prompt(message | messages, context): Promise<RunResult>
lane.compact({ customInstructions? } | undefined, context): Promise<CompactionResult>
lane.navigateTree(targetId | null, options | undefined, context): Promise<NavigationResult>
lane.resume(context): Promise<ResumeResult>
lane.abort(context): Promise<AbortResult>
lane.steer / followUp / cancelQueued
lane.getTipId / findEntries / findEntry
lane.setModel(model, context) / getModel(context)
lane.setThinkingLevel(level, context) / getThinkingLevel(context)
lane.setActiveTools(names, context) / getActiveTools(context)
lane.waitForIdle(context)
```

`RunResult` and friends are `Result` values, not throws:
`Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`, with `ok()`, `err()`,
`getOrThrow()`, `getOrUndefined()`, `toError()`. Error tags include `LaneBusy`,
`NothingToResume`, `InvalidMessage`, `UnknownSkill`, `Closed`.

Harness events are richer than `AgentEvent` and arrive through
`harness.events.on(type, listener) => unsubscribe`. Relevant types: `run_start`, `run_end`,
`turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_start`,
`tool_update`, `tool_end`, `entry_added`, `queue_update`, `usage`, `fault`, `handler_error`,
`compaction_start/end`, `navigation_start/end`. `HarnessEvent` adds `lane` and `recovery`.
`lane.watch(context)` returns a `WatchHandle<LaneSnapshot>`; `reduceLaneSnapshot(snapshot,
event)` (subpath `./harness/runtime/reducer`) folds an event into a snapshot and reports whether
a rebase is needed. Note `watchSession` is declared but unimplemented in 0.85.1.

## Execution environment and built-in tools

`NodeExecutionEnv` implements both halves Alpha needs:

```ts
new NodeExecutionEnv({ cwd, shellPath?, shellEnv? })   // implements FileSystem & Shell
```

`FileSystem` and `Shell` methods all return `Promise<Result<T, FileError|ExecutionError>>` —
they never throw. `ShellExecOptions` carries `cwd?`, `env?`, `inheritEnv?`, `timeout?` (seconds),
`capture?`, `onUpdate?`.

Built-in tools (`./harness/tools`), each returning an `AgentHarnessTool<ExecutionToolContext>`:

```ts
createBashTool({ commandPrefix?, prepare? })  // params { command, timeout? }
createReadTool({ autoResizeImages?, imageProcessor? })  // params { path, offset?, limit? }
createWriteTool()                             // params { path, content }
createEditTool()                              // params { path, edits: [{ oldText, newText }] }
```

`AgentHarnessTool` differs from `AgentTool` only in `execute`'s extra arguments
(`onUpdate, toolContext, invocation, context`), so a custom tool is an object literal either way.
Contexts are injected per harness via `toolContext` — for Alpha, `{ env: NodeExecutionEnv }`.

Truncation helpers: `truncateHead`, `truncateTail`, `truncateLine`, with
`DEFAULT_MAX_LINES = 2000` and a 50KB default byte cap.

## Sessions

```ts
new JsonlSessionRepo({ fileSystem, sessionsRoot, now? })
  .create({ cwd }, context) → Session
  .open(metadata, context) / .list({ cwd? }, context) / .delete(metadata, context)
  .fork(source, options, context)
```

`JsonlSessionRepo` is a `SessionRepo`; `MemorySessionRepo` is the in-memory sibling used by
tests. A `Session` exposes `metadata`, `getEntry(id)`, `getStats()`, `getName()/setName()`,
`findEntries(query)`, `findEntry(query)`, `createBranch()/branch()`, `beginMutation()`,
`setValue/deleteValue/appendList/deleteList`, `close()`. Entry kinds:
`MessageEntry | CompactionEntry | BranchSummaryEntry | CustomEntry`, each with `id`, `parentId`,
`seq`, `timestamp`, `type`, and optional `customType`.

Format versions: `JSONL_FORMAT_VERSION = 4`, `JSONL_STORAGE_VERSION = 1`.

## Models, providers, BYOK

```ts
createModels(options?): MutableModels
  // getProviders/getProvider/getModels/getModel/getAvailable/getAuth/login/logout
  // stream/streamSimple/complete/completeSimple, setProvider/deleteProvider/clearProviders

createProvider({
  id, name?, baseUrl?, headers?, auth: ProviderAuth,
  models: readonly Model<TApi>[], api: ProviderStreams | Partial<Record<TApi, ProviderStreams>>
}): Provider<TApi>
```

A `Model` is a plain object: `{ id, name, api, provider, baseUrl, reasoning, input, cost,
contextWindow, maxTokens, thinkingLevelMap?, samplingParams?, headers?, compat? }`.
`KnownApi` includes `"openai-completions"`, `"anthropic-messages"`, `"openai-responses"`, and
others; `Api` is `KnownApi | (string & {})`.

Auth: credentials resolve in the order explicit `options.apiKey` → `CredentialStore` (an
interface Alpha can implement over its own encrypted store) → the provider's ambient environment
variables. `envApiKeyAuth(name, envVars)` builds an `ApiKeyAuth`; `InMemoryCredentialStore` is
shipped for tests. Request-level options accept `apiKey`, `headers`, `env`, `fetch`, `signal`,
`onPayload`, `onResponse`, `timeoutMs`, `maxRetries`, `maxRetryDelayMs`.

A custom OpenAI-compatible provider — the shape Alpha's BYOK form produces — is:

```ts
createProvider({
  id: "commandcode",
  name: "CommandCode",
  baseUrl: "https://api.commandcode.ai/provider/v1",
  auth: envApiKeyAuth("CommandCode API key", ["COMMANDCODE_API_KEY"]),
  models: [{
    id: "deepseek/deepseek-v4.1-flash",
    name: "DeepSeek V4.1 Flash",
    api: "openai-completions",
    provider: "commandcode",
    baseUrl: "https://api.commandcode.ai/provider/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  }],
  api: openAICompletionsApi(),   // from @earendil-works/pi-ai/api/openai-completions.lazy
});
```

Built-in provider factories ship per provider under `@earendil-works/pi-ai/providers/<id>`
(anthropic, openai, deepseek, google, groq, openrouter, mistral, xai, and more), and
`builtinModels()` / `builtinProviders()` assemble the whole catalog. The core entry is
side-effect-free and browser-safe, which is why it — and not the provider subpath — is what the
main process imports.

## The faux provider (deterministic tests)

`@earendil-works/pi-ai` exports `createFauxProvider` / `registerFauxProvider` from
`dist/providers/faux.js`, plus helpers:

```ts
fauxText(text) / fauxThinking(text) / fauxToolCall(name, args, { id? })
fauxAssistantMessage(content, { stopReason?, errorMessage?, timestamp?, ... })
registration.setResponses(steps) / appendResponses(steps) / state.callCount
```

A step is either an `AssistantMessage` or a factory `(context, options, state, model) => message`.
This is what makes the integration seam testable without a network: the transcript the runtime
produces is real, only the model's replies are scripted.

## Proxy mode (not used)

`streamProxy(model, context, { authToken, proxyUrl, ... })` lets a browser send model calls
through a backend that holds the key. Alpha does not need it — the runtime is already in the main
process — but it is the escape hatch if a future web build appears.

## Open questions resolved during implementation

- Whether the CommandCode endpoint needs a `compat` override (developer role, reasoning effort,
  `max_tokens` field, usage-in-streaming) is not documented anywhere available; the live test
  exists to settle it empirically.
- `@earendil-works/pi-session-backend-sqlite-node` is not installed and is not needed: JSONL
  covers the workbench's scale.
