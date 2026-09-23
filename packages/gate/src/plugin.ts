/**
 * The gate as a face on the plugin base (ADR-0025): the ladder hung on `beforeToolCall`, where an
 * extension file and a stringly protocol used to be. A block becomes the tool result the model
 * reads, in Alpha's words; the verdict's record travels out through `onDecided`, because the plugin
 * owns nothing of the window — announcing `tool_decided` is the runtime's half.
 *
 * Nothing here names pi: the face is `@alpha/plugin`'s, so the gate's wrapping is a library's job
 * like the decision it wraps (C2.8).
 */
import type { ApprovalRecord } from '@alpha/domain'
import type { BeforeToolCallHook } from '@alpha/plugin'
import { createToolGate } from './gate.ts'
import type { PermissionPorts } from './permissions.ts'

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

/** A plugin that carries one face: what the base needs to hang it on the agent. */
export interface GatePlugin {
  name: string
  beforeToolCall: BeforeToolCallHook
}

/** The ladder as a plugin face: ask it about the call, let a block be the reason the model reads. */
export function createGatePlugin(ports: GatePluginPorts): GatePlugin {
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
      const verdict = await gate(call)
      ports.onDecided(call.toolCallId, verdict.record)
      return verdict.block === undefined ? undefined : { block: verdict.block }
    },
  }
}
