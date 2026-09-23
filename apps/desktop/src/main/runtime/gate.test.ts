import type { ApprovalAsk, ApprovalRecord, PermissionLevel, PermissionRule, RuleScope } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
import { createToolGate, type GatePorts } from './gate.ts'

interface Harness {
  gate: ReturnType<typeof createToolGate>
  notes: Map<string, ApprovalRecord>
  asked: ApprovalAsk[]
  remembered: PermissionRule[]
  setAnswer: (answer: { decision: 'once' | 'always' | 'deny'; scope?: RuleScope; reason?: string }) => void
  rules: PermissionRule[]
  level: PermissionLevel
}

const harness = (options: { level?: PermissionLevel; rules?: PermissionRule[] } = {}): Harness => {
  const notes = new Map<string, ApprovalRecord>()
  const asked: ApprovalAsk[] = []
  const remembered: PermissionRule[] = []
  const state = harnessState(options)
  let answer: { decision: 'once' | 'always' | 'deny'; scope?: RuleScope; reason?: string } = { decision: 'once' }

  const ports: GatePorts = {
    level: () => state.level,
    rules: () => state.rules,
    conversationId: 'c1',
    workspacePath: '/dev/alpha',
    ask: async (_conversationId, request) => {
      asked.push(request)
      return answer
    },
    remember: (rule) => {
      remembered.push(rule)
      state.rules = [...state.rules, rule]
    },
    note: (callId, record) => notes.set(callId, record),
  }

  return {
    gate: createToolGate(ports),
    notes,
    asked,
    remembered,
    rules: state.rules,
    get level() {
      return state.level
    },
    set level(level: PermissionLevel) {
      state.level = level
    },
    setAnswer: (next) => {
      answer = next
    },
  }
}

const harnessState = (options: { level?: PermissionLevel; rules?: PermissionRule[] }) => ({
  level: options.level ?? 'ask',
  rules: options.rules ?? [],
})

const call = (toolName: string, args: Record<string, unknown>) => ({ toolCallId: `${toolName}-1`, toolName, args })

describe('[runtime] the gate', () => {
  it('runs a read without asking and records that the level allowed it', async () => {
    const h = harness({ level: 'ask' })

    const result = await h.gate(call('read', { path: 'notes.txt' }))

    expect(result.block).toBeUndefined()
    expect(h.asked).toEqual([])
    expect(h.notes.get('read-1')).toEqual({ kind: 'auto', level: 'ask' })
  })

  it('blocks a write in plan and records the reason, without asking anyone', async () => {
    const h = harness({ level: 'plan' })

    const result = await h.gate(call('write', { path: 'a.txt', content: 'x' }))

    expect(result?.block?.reason).toContain('Plan')
    expect(h.asked).toEqual([])
    expect(h.notes.get('write-1')?.kind).toBe('blocked')
  })

  it('blocks a command in plan too', async () => {
    const h = harness({ level: 'plan' })

    expect((await h.gate(call('bash', { command: 'ls' })))?.block).toBeDefined()
    expect(h.notes.get('bash-1')?.kind).toBe('blocked')
  })

  it('asks before a write in ask, and lets it through when allowed once', async () => {
    const h = harness({ level: 'ask' })
    h.setAnswer({ decision: 'once' })

    const result = await h.gate(call('write', { path: 'a.txt' }))

    expect(result.block).toBeUndefined()
    expect(h.asked).toHaveLength(1)
    expect(h.asked[0]).toMatchObject({
      callId: 'write-1',
      toolName: 'write',
      risk: 'write',
      summary: 'a.txt',
      cwd: '/dev/alpha',
      level: 'ask',
    })
    expect(h.remembered).toEqual([])
    expect(h.notes.get('write-1')).toEqual({ kind: 'once', level: 'ask' })
  })

  it('records the working directory on the request, so the card can say what it will touch', async () => {
    const h = harness({ level: 'ask' })

    await h.gate(call('bash', { command: 'pnpm test' }))

    expect(h.asked[0].cwd).toBe('/dev/alpha')
    expect(h.asked[0].summary).toBe('pnpm test')
  })

  it('remembers a workspace rule when the user chooses always, and stamps the row', async () => {
    const h = harness({ level: 'ask' })
    h.setAnswer({ decision: 'always', scope: 'workspace' })

    const result = await h.gate(call('bash', { command: 'pnpm test' }))

    expect(result.block).toBeUndefined()
    expect(h.remembered).toHaveLength(1)
    expect(h.remembered[0]).toMatchObject({
      scope: 'workspace',
      conversationId: '',
      workspacePath: '/dev/alpha',
      toolName: 'bash',
      pattern: 'pnpm test',
    })
    expect(h.notes.get('bash-1')).toEqual({ kind: 'always', level: 'ask', ruleId: h.remembered[0].id })
  })

  it('remembers a conversation-scoped rule with the conversation on it', async () => {
    const h = harness({ level: 'ask' })
    h.setAnswer({ decision: 'always', scope: 'conversation' })

    await h.gate(call('write', { path: 'src/index.ts' }))

    expect(h.remembered[0]).toMatchObject({ scope: 'conversation', conversationId: 'c1', pattern: 'src/index.ts' })
  })

  it('defaults to the conversation scope when the answer names none', async () => {
    const h = harness({ level: 'ask' })
    h.setAnswer({ decision: 'always' })

    await h.gate(call('write', { path: 'src/index.ts' }))

    expect(h.remembered[0].scope).toBe('conversation')
  })

  it('hands the reason back to the model when denied, and records the denial', async () => {
    const h = harness({ level: 'ask' })
    h.setAnswer({ decision: 'deny', reason: 'not that file' })

    const result = await h.gate(call('bash', { command: 'rm -rf build' }))

    expect(result?.block?.reason).toBe('not that file')
    expect(h.notes.get('bash-1')).toEqual({ kind: 'denied', level: 'ask', reason: 'not that file' })
    expect(h.remembered).toEqual([])
  })

  it('says something useful when denied with no reason given', async () => {
    const h = harness({ level: 'ask' })
    h.setAnswer({ decision: 'deny' })

    const result = await h.gate(call('bash', { command: 'rm -rf build' }))

    expect(result?.block?.reason).toContain('denied')
    expect(h.notes.get('bash-1')?.reason).toBe(result?.block?.reason)
  })

  it('does not ask for a call a remembered rule already covers', async () => {
    const rule: PermissionRule = {
      id: 'r1',
      scope: 'workspace',
      conversationId: '',
      workspacePath: '/dev/alpha',
      toolName: 'bash',
      pattern: 'pnpm test',
      createdAt: 1,
    }
    const h = harness({ level: 'ask', rules: [rule] })

    const result = await h.gate(call('bash', { command: 'pnpm test --run' }))

    expect(result.block).toBeUndefined()
    expect(h.asked).toEqual([])
    expect(h.notes.get('bash-1')).toEqual({ kind: 'rule', level: 'ask', ruleId: 'r1' })
  })

  it('never asks at full access', async () => {
    const h = harness({ level: 'full-access' })

    await h.gate(call('bash', { command: 'rm -rf /' }))

    expect(h.asked).toEqual([])
    expect(h.notes.get('bash-1')).toEqual({ kind: 'auto', level: 'full-access' })
  })

  it('does not ask for a file write at accept-edits, but does ask for a command', async () => {
    const h = harness({ level: 'accept-edits' })

    await h.gate(call('write', { path: 'a.txt' }))
    await h.gate(call('bash', { command: 'pnpm test' }))

    expect(h.asked.map((request) => request.toolName)).toEqual(['bash'])
    expect(h.notes.get('write-1')).toEqual({ kind: 'auto', level: 'accept-edits' })
  })

  it('reads the level at the moment of the call, so changing it applies to the next one', async () => {
    const h = harness({ level: 'plan' })

    expect((await h.gate(call('write', { path: 'a.txt' })))?.block).toBeDefined()
    h.level = 'full-access'
    expect((await h.gate(call('write', { path: 'b.txt' }))).block).toBeUndefined()
  })

  it('treats a blocked call as blocked even when the level changed while it waited', async () => {
    const h = harness({ level: 'ask' })
    h.setAnswer({ decision: 'deny', reason: 'no' })

    const result = await h.gate(call('bash', { command: 'ls' }))

    expect(result?.block?.reason).toBe('no')
  })
})
