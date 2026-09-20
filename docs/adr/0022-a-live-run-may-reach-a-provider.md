# A live run may reach a provider

The live tests keep their scripted model on the loopback interface, and gain a second seam beside
it: one spec, skipped unless the environment names a real `pi`, a provider's base URL, a model and
a key, that runs a turn against the provider the person actually configured
(`e2e/live.spec.ts`, C4.4).

## Context

Everything else that covers Alpha's agent seam replaces the *model*, not the wiring: the scripted
agent in `tools/scripted-agent/` is a real child process that speaks pi's RPC protocol and asks
Alpha's gate before a tool call, and `tools/fake-provider/` answers on loopback. That is the right
default — the suite stays hermetic and credential-free — but four things live beyond it, and all
four are Alpha's own: the `models.json` it writes into its agent directory (base URL, wire
protocol, the credential *named* rather than written), the credential it hands over in the child's
environment, the `--provider`/`--model` it puts on the command line, and what a real `pi` does when
a real model decides to call a tool. Against a stand-in, all four are Alpha agreeing with itself.

The gap was found by running it by hand (2026-09-20), against `pi` 0.86.1 and an Ollama-cloud
provider speaking `openai-completions`: a plain answer arrived in 3.3 seconds with usage reported,
and a `bash` call waited for approval, ran, and came back in a second assistant message 1.4 seconds
after the person allowed it. Nothing in Alpha needed changing. The seam to keep checking it was
what was missing.

## Decision

**One spec dials out, and only when it is told what to dial.** `e2e/live.spec.ts` is skipped unless
`ALPHA_LIVE_PI`, `ALPHA_LIVE_BASE_URL`, `ALPHA_LIVE_MODEL` and `ALPHA_LIVE_KEY` are all set. It
speaks `openai-completions`, the one protocol it knows; a provider speaking another is another
test, written when there is one to write it against.

**The key never leaves the run.** It is read from the environment, written only into the vault file
of that run's own `/tmp` data directory — the teardown sweeps it — and printed nowhere. No
credential is committed, and the default run still starts no agent and makes no network request.

**It asserts wiring, not wording.** The first turn asks for a fixed string and waits for it. The
second asks in words for a command to be run, waits for the approval the Ask level demands, allows
it, and then requires a *new* assistant message carrying what the command printed: the file's
content is a word the test made up, so only a command that really ran can produce it. Counting
messages is what separates that answer from the tool's own row, which carries the same output.

## Consequences

The live seam can fail for reasons Alpha does not own: a rate limit, an outage, a model that
ignores the instruction, or simply slowness — the same follow-up answer took 1.4 seconds in one run
and about three minutes in another. A red run here is a prompt to look, not a verdict, and it says
nothing in CI, where the variables are absent.

What it covers is the part of the agent seam that no stand-in can reach, and it is now cheap to
re-run: four variables and one file. The loopback seam keeps its place, and remains the one that
runs with only `ALPHA_LIVE_PI` set — a developer with `pi` installed gets that without configuring
anything else.
