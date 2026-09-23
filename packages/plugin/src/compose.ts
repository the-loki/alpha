/**
 * How faces in order become one decision. The `beforeToolCall` chain is the one rule the base has
 * to state: the first hook that blocks wins and the hooks behind it are never asked — a blocked
 * call is not a debate — while a hook with no verdict lets the next one speak.
 *
 * Pure on purpose: the decision is testable without an agent, and the adapter that asks pi's
 * context for the call stays in `main`. The same call is handed to each hook in turn — hooks read
 * it, they do not own it — and the hooks to ask are read from the list each time, so a plugin
 * registered after assembly is still asked.
 */

import type { Undef } from '@alpha/domain'
import type { BeforeToolCallHook, ToolVerdict } from './faces.ts'

export function chainToolVerdicts(hooks: readonly BeforeToolCallHook[]): BeforeToolCallHook {
  return async (call): Promise<Undef<ToolVerdict>> => {
    for (const hook of hooks) {
      const verdict = await hook(call)
      if (verdict?.block !== undefined) return verdict
    }
    return undefined
  }
}
