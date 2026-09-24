/**
 * How faces in order become one decision. Two rules the base has to state: about a call, the first
 * hook that blocks wins and the hooks behind it are never asked — a blocked call is not a debate —
 * while a hook with no verdict lets the next one speak; about a run's end, every hook is asked and
 * any one of them asking for a retry is enough, because observing a run is not the same as
 * deciding it.
 *
 * Pure on purpose: the decisions are testable without an agent, and the adapter that asks pi's
 * context for the call stays in `@alpha/agent`. The same call, or the same outcome, is handed to each hook
 * in turn — hooks read it, they do not own it — and the hooks to ask are read from the list each
 * time, so a plugin registered after assembly is still asked.
 */

import type { Undef } from '@alpha/domain'
import type { AfterRunHook, AfterRunVerdict, BeforeToolCallHook, ToolVerdict } from './faces.ts'

export function chainToolVerdicts(hooks: readonly BeforeToolCallHook[]): BeforeToolCallHook {
  return async (call): Promise<Undef<ToolVerdict>> => {
    for (const hook of hooks) {
      const verdict = await hook(call)
      if (verdict?.block !== undefined) return verdict
    }
    return undefined
  }
}

export function chainAfterRunVerdicts(hooks: readonly AfterRunHook[]): AfterRunHook {
  return async (outcome): Promise<Undef<AfterRunVerdict>> => {
    let retry = false
    for (const hook of hooks) {
      const verdict = await hook(outcome)
      if (verdict?.retry === true) retry = true
    }
    // A run the person stopped is not a run to drive again, however loudly a hook asks.
    return retry && !outcome.aborted ? { retry: true } : undefined
  }
}
