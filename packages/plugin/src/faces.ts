/**
 * What a plugin is handed and what it answers, in Alpha's own words: one pending tool call, the
 * verdict about it, the outcome of a run, and the retry policy's decision. Pure — no pi, no disk,
 * no window — so the faces can be stated, implemented and tested without the agent being present.
 * The adapter that hands these to pi lives in `@alpha/agent`.
 */
import type { Undef } from '@alpha/domain'

/** One pending tool call a `beforeToolCall` hook is asked about. */
export interface PluginToolCall {
  toolCallId: string
  toolName: string
  args: unknown
}

/** A hook's answer about one tool call: a block carries the reason the model reads. */
export interface ToolBlock {
  reason: string
}

export interface ToolVerdict {
  block?: ToolBlock
}

/** What a `beforeToolCall` hook is: the answer for one call, in order with the other hooks. */
export type BeforeToolCallHook = (call: PluginToolCall) => Promise<Undef<ToolVerdict>>

/**
 * A run that failed. Its `message` is what it said about it, kept as it was said, when it said
 * anything: whether a run failed and what it said are two answers, and a provider that erred
 * without a sentence is a failed run that said nothing rather than a run that did not fail.
 */
export interface RunFailure {
  message?: string
}

/** How the run that just ended turned out. */
export interface AfterRunOutcome {
  /** The failure the run ended with, when it failed; an abort is not a failure. */
  failed: Undef<RunFailure>
  aborted: boolean
}

export interface AfterRunVerdict {
  /** Ask the base to continue the agent once the run settles. Ignored for an aborted run. */
  retry?: boolean
}

/**
 * What an `afterRun` hook is: how the run turned out, and whether the base should continue it. The
 * hook is handed the outcome and not the agent — one that needs the transcript holds its own ports
 * — which is what lets the policy live in a library while the driver stays in `main`. A run the
 * person stopped is shown to every hook, but no hook's answer to it becomes a retry.
 */
export type AfterRunHook = (outcome: AfterRunOutcome) => Promise<Undef<AfterRunVerdict>>

/**
 * The retry policy's pure decision — a failure, no abort, attempts to spend — consulted wherever a
 * run's end is being judged: by the hook that takes an attempt, and by the translator that decides
 * whether an ended run is over at all.
 */
export interface RetryDecider {
  shouldRetry(outcome: AfterRunOutcome): boolean
}
