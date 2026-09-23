# 04 — Testing

## C4.1 — Red before green, one slice at a time

Work is built test-first. The loop is: write the test that should fail, watch it fail for the
right reason, write the least code that passes, move on. Tests are not written in a batch before
the implementation they cover: bulk tests verify imagined behaviour and go insensitive to real
change.

Refactoring belongs to review, not to the red-green loop.

**Enforcement:** review; the commit history is expected to show the pairing.

## C4.2 — Test at the named seams

A seam is a public boundary: the interface tests may cross. Tests live at seams and never reach
inside a module. Alpha has four:

| Seam | What it is | Test kind |
| --- | --- | --- |
| `@alpha/domain`'s functions | Pure functions and stores over domain types | Unit, no I/O |
| The IPC contract | The typed surface preload exposes, driven end to end | Integration, real runtime, scripted provider |
| The agent runtime | Conversation lifecycle: prompt → turn → tool → result | Integration, scripted provider |
| The window | What a user sees and can do | E2E, Playwright + Electron |

The IPC contract seam is the important one: it exercises the real runtime, the real permission
gate, the real store, the real preload bridge, and the real model-client dispatch against a
scripted provider — so a passing suite means the wiring works, not that a mock agrees with itself.

**Enforcement:** review. New test files declare the seam they target in the top-level `describe`.

## C4.3 — The scripted provider, not a mocked runtime

Tests replace the *model*, never the wiring. Unit and integration tests drive the assembled
agent — the same plugin base the workbench runs — through the scripted provider fixture the base
ships beside itself, `@alpha/agent/testing`: a real pi-ai `Models` whose one provider streams a
scripted answer, so a run goes through the real dispatch, the real gate, and the real session
store, with only the model's answers decided in advance. The e2e specs run the real window against
a scripted OpenAI-completions provider on loopback (`e2e/scripted-provider.ts`), speaking the SSE
frames pi-ai's client speaks. Neither mocks the agent, the gate, the session store, or the IPC
transport: any of those being wrong is exactly the bug the test should catch.

The things a script cannot show are checked against a real provider when the environment names
one (C4.4): that the credential reaches the model runtime, and that a tool the model decided to
call really runs.

**Enforcement:** review — a test that reaches inside a module instead of driving the assembled
agent through the scripted provider is the finding.

## C4.4 — The live tests, gated by an environment variable

The suite's own seam is the scripted provider on the loopback interface — no network, no
credential. The one test that needs a real provider runs only when the environment names one: it
is what the credential's path to the model runtime and a tool call the model decided to make are
checked against, none of which a script can show
([ADR-0022](../adr/0022-a-live-run-may-reach-a-provider.md)).

| Variable | Meaning |
| --- | --- |
| `ALPHA_LIVE_BASE_URL` | The provider's base URL, e.g. `https://ollama.com/v1` |
| `ALPHA_LIVE_MODEL` | The model id to run there |
| `ALPHA_LIVE_KEY` | A key for it: read from the environment, held in that run's own vault file, and committed nowhere |
| `ALPHA_LIVE_API` | The wire protocol, `openai-completions` by default; `anthropic-messages` and `openai-responses` are the others Alpha speaks |
| `ALPHA_LIVE_CONTEXT` / `ALPHA_LIVE_OUTPUT` | The model's context window and output room, 128000/8192 by default — this test's numbers, not the model's |
| `ALPHA_LIVE_IMAGES` | `1` enables the attached-picture turn, for a model that takes images |

Naming fewer than the first three skips it, so `e2e/live.spec.ts` is the only file in the
repository that dials out. It covers the whole surface a conversation has against a real model: a
plain turn with the provider's own usage, regenerating an answer, closing and reopening the
workbench onto the stored conversation, a tool call the gate waits on, an attached picture, and a
thinking level the person picked. No credential is ever committed, and the default test run makes
no network request. CI skips it; a developer names their own provider when they want the real one.

**Enforcement:** the live test file skips itself when its variables are absent, and the scripted
provider is started on `127.0.0.1` by the specs that need it.

## C4.5 — What a test asserts

A test asserts observable behaviour through the seam: the message a user sees, the decision the
permission gate returned, the entry the transcript holds. It does not assert the number of calls
into a private collaborator, the shape of internal state, or a snapshot of a rendered tree.

Expected values come from an independent source: a literal from the spec, a worked example, a
value read from the transcript after a real run.

**Enforcement:** review, with the tautology and implementation-coupling patterns named in
`/tdd` as the checklist.

## C4.6 — The constraint checker tests itself

`pnpm check:constraints` enforces the machine-checkable rules in this directory. Its own logic is
covered by tests over source strings that must pass and must fail, so a broken regex cannot
silently pass the whole repo.

**Enforcement:** `packages/domain`'s unit tests plus the checker's own fixtures.
