/**
 * The gate plugin (ADR-0025): the ladder, wrapped as a `beforeToolCall` hook. The gate itself is
 * untouched — the plugin is only how it hangs on the agent now, where an extension file and a
 * stringly protocol used to be. A block becomes the tool result the model reads, in Alpha's words;
 * the verdict's record travels out through the `onDecided` port, because the plugin owns nothing
 * of the window — announcing `tool_decided` is the runtime's half.
 */

import { type ApprovalRecord, recordOf } from '@alpha/core'
import { createToolGate } from './gate.ts'
import type { PermissionPorts } from './permissions.ts'
import type { AlphaPlugin } from './plugin-contract.ts'

/** What the gate plugin needs: where the call happens, and how the ladder reaches the workbench. */
export interface GatePluginPorts {
  conversationId: string
  workspacePath: string
  /** The level in force, the rules remembered, and the person to ask (permissions.ts). */
  permissions: PermissionPorts
  /** Keeps each decision beside the session, so the transcript's rows carry how it got past. */
  note: (callId: string, record: ApprovalRecord) => void
  /** How the decision reaches the runtime, which announces it to the window (`tool_decided`). */
  onDecided: (callId: string, record: ApprovalRecord) => void
}

/** The ladder as a plugin hook: ask it about the call, let a block be the reason the model reads. */
export function createGatePlugin(ports: GatePluginPorts): AlphaPlugin {
  const gate = createToolGate({
    level: ports.permissions.level,
    rules: ports.permissions.rules,
    remember: ports.permissions.remember,
    ask: ports.permissions.ask,
    conversationId: ports.conversationId,
    workspacePath: ports.workspacePath,
    note: ports.note,
  })
  return {
    name: 'gate',
    beforeToolCall: async (call) => {
      const verdict = await gate({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        args: recordOf(call.args),
      })
      ports.onDecided(call.toolCallId, verdict.record)
      return verdict.block === undefined ? undefined : { block: verdict.block }
    },
  }
}
