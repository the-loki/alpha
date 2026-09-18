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
| The IPC contract | The typed surface preload exposes, driven end to end | Integration, real runtime, scripted model |
| The agent runtime | Conversation lifecycle: prompt → turn → tool → result | Integration, scripted model |
| The window | What a user sees and can do | E2E, Playwright + Electron |

The IPC contract seam is the important one: it exercises the real runtime, the real permission
gate, the real store, and the real preload bridge, while replacing only the model — so a passing
suite means the wiring works, not that a mock agrees with itself.

**Enforcement:** review. New test files declare the seam they target in the top-level `describe`.

## C4.3 — The scripted model, not a mocked runtime

Integration tests replace the *model* with `pi-ai`'s faux provider, which returns scripted
assistant messages deterministically. They do not mock the agent runtime, the permission gate,
the session store, or the IPC transport: any of those being wrong is exactly the bug the test
should catch.

**Enforcement:** `pnpm check:constraints` fails if `vi.mock` is used on `@earendil-works/*` or on
a `core` module inside an integration test.

## C4.4 — One live test, gated by an environment variable

A single end-to-end test talks to a real model to prove the provider client, the wire protocol,
and streaming actually work. It runs only when `ALPHA_LIVE_TEST=1` is set, and it reads its
endpoint and key from the environment:

| Variable | Meaning |
| --- | --- |
| `ALPHA_LIVE_TEST` | `1` to enable the live test; anything else skips it |
| `ALPHA_LIVE_BASE_URL` | Provider base URL, e.g. `https://api.commandcode.ai/provider/v1` |
| `ALPHA_LIVE_API_KEY` | Credential for that provider |
| `ALPHA_LIVE_MODEL` | Model id, e.g. `deepseek/deepseek-v4.1-flash` |
| `ALPHA_LIVE_API` | Wire protocol, defaults to `openai-completions` |

No credential is ever committed, and the default test run makes no network request. The developer
running it locally supplies the values from their own ZCode configuration; CI skips it.

**Enforcement:** the live test file calls a shared `requireLiveEnv()` helper that skips with a
printed reason when the variables are absent.

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
