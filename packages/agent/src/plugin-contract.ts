/**
 * The plugin contract Alpha assembles its agent from (ADR-0025), as pi needs it: the vocabulary of
 * a face is `@alpha/plugin`, and what lives here is the binding — where pi's `AgentTool` goes, and
 * which of the library's hooks the workbench carries. Tools concatenate in assembly order; `beforeToolCall`
 * and `afterRun` chain in that order, each with its own rule (`chainToolVerdicts`,
 * `chainAfterRunVerdicts`, in the library). The contract is Alpha's own: no external files, no
 * loader, no re-implementation of coding-agent's extension format.
 */

import type { AfterRunHook, BeforeToolCallHook } from '@alpha/plugin'
import type { AgentTool } from '@earendil-works/pi-agent-core'

/** One Alpha plugin: a name and the faces it contributes. */
export interface AlphaPlugin {
  name: string
  tools?: () => AgentTool[]
  beforeToolCall?: BeforeToolCallHook
  afterRun?: AfterRunHook
}
