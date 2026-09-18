import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ApprovalAsk, ApprovalRecord, PermissionLevel, PermissionRule, RuntimeEvent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { ApprovalBroker } from './approvals.ts'
import { ConversationRuntime } from './conversation-runtime.ts'
import type { ApprovalAnswer } from './gate.ts'
import { resolveModelRuntime } from './models.ts'

/**
 * The gate, through a real harness: the model asks for something, the policy answers, and the
 * workspace is the evidence. Nothing here is a mock — a denied call is a call that did not happen.
 */
interface GateOptions {
  level?: PermissionLevel
  rules?: PermissionRule[]
  answer?: ApprovalAnswer
}

const open = async (options: GateOptions & { workspace: string; replies: unknown[] }) => {
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
  const events: RuntimeEvent[] = []
  const asked: ApprovalAsk[] = []
  const remembered: PermissionRule[] = []
  const state = { level: options.level ?? 'ask', rules: options.rules ?? [] }
  // The real broker, so the card's events are the ones the window would get, and the answer
  // travels the same path a person's click does.
  const broker = new ApprovalBroker({ emit: (event) => events.push(event) })

  const opened = await ConversationRuntime.open({
    conversationId: 'gate',
    workspacePath: options.workspace,
    sessionsRoot,
    modelRuntime: resolveModelRuntime({
      ALPHA_FAUX: '1',
      ALPHA_FAUX_REPLIES: JSON.stringify(options.replies),
    }),
    systemPrompt: 'You are Alpha.',
    permissions: {
      level: () => state.level,
      rules: () => state.rules,
      remember: (rule) => {
        remembered.push(rule)
        state.rules = [...state.rules, rule]
      },
      ask: (conversationId, ask) => {
        asked.push(ask)
        const waiting = broker.ask(conversationId, ask)
        queueMicrotask(() => {
          const request = [...events].reverse().find((event) => event.type === 'approval_requested')
          if (request?.type === 'approval_requested') {
            broker.answer(conversationId, request.request.requestId, options.answer ?? { decision: 'once' })
          }
        })
        return waiting
      },
    },
    emit: (event) => events.push(event),
  })
  return { ...opened, events, asked, remembered, state, sessionsRoot }
}

const workspace = (): string => mkdtempSync(join(tmpdir(), 'alpha-workspace-'))

const rowOf = (messages: { blocks: unknown[] }[], index = 0) => {
  const blocks = messages
    .flatMap((message) => message.blocks)
    .filter((block): block is { kind: 'tool' } & Record<string, unknown> => {
      return typeof block === 'object' && block !== null && (block as { kind?: string }).kind === 'tool'
    })
  return blocks[index]
}

const approvalOf = (events: RuntimeEvent[], callId: string): ApprovalRecord | undefined => {
  const started = events.find((event) => event.type === 'tool_started' && event.callId === callId)
  return started?.type === 'tool_started' ? started.approval : undefined
}

const callIdOf = (events: RuntimeEvent[]): string => {
  const started = events.find((event) => event.type === 'tool_started')
  return started?.type === 'tool_started' ? started.callId : ''
}

const writeCall = { tool: { name: 'write', args: { path: 'made.txt', content: 'written' } } }

describe('a call the gate allows', () => {
  it('runs it, and the row says a person allowed it', async () => {
    const workspacePath = workspace()
    const { runtime, events, asked } = await open({
      workspace: workspacePath,
      replies: [writeCall, 'Wrote it.'],
      answer: { decision: 'once' },
    })

    await runtime.prompt('write the file')
    await runtime.close()

    expect(readFileSync(join(workspacePath, 'made.txt'), 'utf8')).toBe('written')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ toolName: 'write', risk: 'write', summary: 'made.txt', level: 'ask' })
    expect(approvalOf(events, callIdOf(events))).toEqual({ kind: 'once', level: 'ask' })
  })

  it('asks before the call starts, so the card is up while nothing has run yet', async () => {
    const { runtime, events } = await open({ workspace: workspace(), replies: [writeCall, 'done'] })

    await runtime.prompt('write the file')
    await runtime.close()

    const requested = events.findIndex((event) => event.type === 'approval_requested')
    const started = events.findIndex((event) => event.type === 'tool_started')
    expect(requested).toBeGreaterThanOrEqual(0)
    expect(requested).toBeLessThan(started)
  })

  it('shows the proposed change on the card, so the user sees what they are approving', async () => {
    const { runtime, asked } = await open({ workspace: workspace(), replies: [writeCall, 'done'] })

    await runtime.prompt('write the file')
    await runtime.close()

    expect(asked[0].diff).toContain('+written')
  })

  it('runs the next matching call without a card once the user says always', async () => {
    const workspacePath = workspace()
    const edit = { tool: { name: 'write', args: { path: 'src/main.ts', content: 'x' } } }
    const { runtime, asked, remembered } = await open({
      workspace: workspacePath,
      replies: [edit, edit, 'Both written.'],
      answer: { decision: 'always', scope: 'workspace' },
    })

    await runtime.prompt('write the file')
    await runtime.close()

    expect(remembered).toHaveLength(1)
    expect(remembered[0]).toMatchObject({ scope: 'workspace', toolName: 'write', pattern: 'src/main.ts' })
    expect(asked).toHaveLength(1)
    expect(readFileSync(join(workspacePath, 'src/main.ts'), 'utf8')).toBe('x')
  })

  it('never asks at full access', async () => {
    const workspacePath = workspace()
    const { runtime, events, asked } = await open({
      workspace: workspacePath,
      replies: [writeCall, 'done'],
      level: 'full-access',
    })

    await runtime.prompt('write the file')
    await runtime.close()

    expect(asked).toEqual([])
    expect(approvalOf(events, callIdOf(events))).toEqual({ kind: 'auto', level: 'full-access' })
  })

  it('lets a file write through at accept-edits but still asks before a command', async () => {
    const workspacePath = workspace()
    const { runtime, events, asked } = await open({
      workspace: workspacePath,
      level: 'accept-edits',
      replies: [writeCall, { tool: { name: 'bash', args: { command: 'echo hi' } } }, 'done'],
    })

    await runtime.prompt('write and run')
    await runtime.close()

    expect(asked.map((ask) => ask.toolName)).toEqual(['bash'])
    expect(approvalOf(events, callIdOf(events))).toEqual({ kind: 'auto', level: 'accept-edits' })
  })
})

describe('a call the gate refuses', () => {
  it('blocks a write in plan without asking anyone, and says why', async () => {
    const workspacePath = workspace()
    const { runtime, events, asked } = await open({
      workspace: workspacePath,
      level: 'plan',
      replies: [writeCall, 'Understood.'],
    })

    await runtime.prompt('write the file')
    await runtime.close()

    expect(asked).toEqual([])
    expect(existsSync(join(workspacePath, 'made.txt'))).toBe(false)
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' && finished.output).toContain('Plan')
    expect(approvalOf(events, callIdOf(events))?.kind).toBe('blocked')
  })

  it('does not run a denied call, and hands the reason to the model', async () => {
    const workspacePath = workspace()
    const { runtime, events } = await open({
      workspace: workspacePath,
      replies: [writeCall, 'I will not write it.'],
      answer: { decision: 'deny', reason: 'that file is generated' },
    })

    await runtime.prompt('write the file')
    const transcript = await runtime.transcript()
    await runtime.close()

    expect(existsSync(join(workspacePath, 'made.txt'))).toBe(false)
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' && finished.status).toBe('failed')
    expect(finished?.type === 'tool_finished' && finished.output).toBe('that file is generated')
    expect(approvalOf(events, callIdOf(events))).toEqual({
      kind: 'denied',
      level: 'ask',
      reason: 'that file is generated',
    })
    // What the model receives next is the persisted tool result, so the row must hold the reason.
    expect(rowOf(transcript)).toMatchObject({ name: 'write', status: 'failed', output: 'that file is generated' })
  })

  it('tells the model the call was denied when no reason was given', async () => {
    const { runtime, events } = await open({
      workspace: workspace(),
      replies: [writeCall, 'ok'],
      answer: { decision: 'deny' },
    })

    await runtime.prompt('write the file')
    await runtime.close()

    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' && finished.output).toContain('denied')
  })
})

describe('revoking a remembered rule', () => {
  it('makes the next matching call ask again', async () => {
    const workspacePath = workspace()
    const edit = { tool: { name: 'write', args: { path: 'src/main.ts', content: 'x' } } }
    const { runtime, asked, remembered, state } = await open({
      workspace: workspacePath,
      replies: [edit, edit, 'Written.', edit, 'Written again.'],
      answer: { decision: 'always', scope: 'workspace' },
    })

    await runtime.prompt('write it')
    expect(asked).toHaveLength(1)

    state.rules = state.rules.filter((rule) => rule.id !== remembered[0].id)
    await runtime.prompt('write it again')
    await runtime.close()

    expect(asked).toHaveLength(2)
    expect(asked[1]).toMatchObject({ toolName: 'write', summary: 'src/main.ts' })
  })
})

describe('changing the level', () => {
  it('applies to the next call without restarting the conversation', async () => {
    const workspacePath = workspace()
    const { runtime, events, state } = await open({
      workspace: workspacePath,
      level: 'plan',
      replies: [writeCall, 'I will not write it.', writeCall, 'Written now.'],
    })

    await runtime.prompt('write the file')
    expect(existsSync(join(workspacePath, 'made.txt'))).toBe(false)

    state.level = 'full-access'
    await runtime.prompt('now write it')
    await runtime.close()

    expect(readFileSync(join(workspacePath, 'made.txt'), 'utf8')).toBe('written')
    const finished = events.filter((event) => event.type === 'tool_finished')
    expect(finished[0]?.type === 'tool_finished' && finished[0].status).toBe('failed')
    expect(finished[1]?.type === 'tool_finished' && finished[1].status).toBe('ok')
  })
})
