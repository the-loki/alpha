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
| `core`'s domain functions | Pure functions and stores over domain types | Unit, no I/O |
| The IPC contract | The typed surface preload exposes, driven end to end | Integration, real runtime, scripted agent |
| The agent runtime | Conversation lifecycle: prompt → turn → tool → result | Integration, scripted agent |
| The window | What a user sees and can do | E2E, Playwright + Electron |

The IPC contract seam is the important one: it exercises the real runtime, the real permission
gate, the real store, the real preload bridge, and a real child process speaking pi's protocol —
so a passing suite means the wiring works, not that a mock agrees with itself.

**Enforcement:** review. New test files declare the seam they target in the top-level `describe`.

## C4.3 — The scripted agent, not a mocked runtime

Integration tests replace the *agent* with the scripted stand-in in `tools/scripted-agent/`: a real
child process that speaks pi's RPC protocol, keeps a session the way pi keeps one, asks Alpha's
gate before a tool call, and really writes and runs what its script tells it to. Only the model's
answers are decided in advance. They do not mock the agent process, the gate, the session, or the
IPC transport: any of those being wrong is exactly the bug the test should catch.

The things a stand-in cannot show are checked against a real `pi` when one is installed
(`ALPHA_LIVE_PI`), with a scripted model endpoint on the other end
(`tools/fake-provider/`): that Alpha's gate extension is loaded, and that a refusal reaches the
model as a refusal.

**Enforcement:** `pnpm check:constraints` fails if `vi.mock` is used inside an integration test.

## C4.4 — The live tests, gated by an environment variable

The tests that need a real agent run only when one is named, and they talk to a scripted model
endpoint on the loopback interface rather than to a provider:

| Variable | Meaning |
| --- | --- |
| `ALPHA_LIVE_PI` | Path to a real `pi`; anything else skips the live tests |
| `FAKE_PROVIDER_PORT` | Port for the scripted model endpoint, `0` (any free port) by default |

No credential is ever committed, and the default test run starts no agent and makes no network
request. CI skips them; a developer with `pi` installed runs them against the scripted endpoint.

**Enforcement:** each live test file skips itself when the variable is absent, and the endpoint is
started on `127.0.0.1` by the test that needs it.

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

**Enforcement:** `packages/core` unit tests plus a fixture-driven test in the checker package.
