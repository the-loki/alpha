import type { ApprovalRecord, PermissionLevel, PermissionRule } from '@alpha/domain'
import type { ApprovalAnswer } from '@alpha/gate'
import { describe, expect, it } from 'vitest'
import type { GatePluginPorts } from './gate-plugin.ts'
import { createGatePlugin } from './gate-plugin.ts'

/**
 * The gate's face on the base, without an agent: what the base is answered for a call that runs, a
 * call the level blocks, and a call a person has to answer. The agent-level behaviour — what the
 * model reads, what the session keeps — is `gate-in-agent.test.ts` in the app.
 */
const pluginFor = (level: PermissionLevel, answer: ApprovalAnswer = { decision: 'once' }) => {
  const decided: Array<{ callId: string; record: ApprovalRecord }> = []
  const remembered: PermissionRule[] = []
  const ports: GatePluginPorts = {
    conversationId: 'c1',
    workspacePath: '/tmp/workspace',
    permissions: {
      level: () => level,
      rules: () => [],
      remember: (rule) => remembered.push(rule),
      ask: async () => answer,
    },
    note: () => {},
    onDecided: (callId, record) => decided.push({ callId, record }),
  }
  return { plugin: createGatePlugin(ports), decided, remembered }
}

describe('[gate] the plugin face', () => {
  it('answers nothing for a call the level lets run, and says how it got past', async () => {
    const { plugin, decided } = pluginFor('accept-edits')
    const verdict = await plugin.beforeToolCall?.({ toolCallId: 'call-1', toolName: 'read', args: { path: 'a.txt' } })

    expect(verdict).toBeUndefined()
    expect(decided).toEqual([{ callId: 'call-1', record: { kind: 'auto', level: 'accept-edits' } }])
  })

  it('carries a block as the reason the model reads, with the record beside it', async () => {
    const { plugin, decided } = pluginFor('plan')
    const verdict = await plugin.beforeToolCall?.({
      toolCallId: 'call-2',
      toolName: 'bash',
      args: { command: 'rm -rf build' },
    })

    expect(verdict?.block?.reason.length ?? 0).toBeGreaterThan(0)
    expect(decided[0]?.record).toMatchObject({ kind: 'blocked', level: 'plan' })
  })

  it('asks when the level says to, and a denial becomes a block', async () => {
    const { plugin, decided } = pluginFor('ask', { decision: 'deny', reason: 'not that directory' })
    const verdict = await plugin.beforeToolCall?.({
      toolCallId: 'call-3',
      toolName: 'bash',
      args: { command: 'rm -rf build' },
    })

    expect(verdict?.block?.reason).toBe('not that directory')
    expect(decided[0]?.record).toMatchObject({ kind: 'denied', level: 'ask', reason: 'not that directory' })
  })

  it('an always writes the rule the answer asked for', async () => {
    const { plugin, remembered } = pluginFor('ask', { decision: 'always', scope: 'conversation' })
    const verdict = await plugin.beforeToolCall?.({
      toolCallId: 'call-4',
      toolName: 'bash',
      args: { command: 'echo once-more' },
    })

    expect(verdict).toBeUndefined()
    expect(remembered).toHaveLength(1)
    expect(remembered[0]).toMatchObject({ toolName: 'bash', pattern: 'echo once-more', conversationId: 'c1' })
  })
})
