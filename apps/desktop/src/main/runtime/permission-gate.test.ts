import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ApprovalAsk, ApprovalRecord, PermissionLevel, PermissionRule, RuntimeEvent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { rpcArgs } from '../agent-cli/rpc.ts'
import { ApprovalBroker } from './approvals.ts'
import { ConversationRuntime } from './conversation-runtime.ts'
import type { ApprovalAnswer } from './gate.ts'

/** The scripted stand-in for pi, which asks Alpha's gate the way the real agent's extension does. */
const SCRIPTED_AGENT = join(import.meta.dirname, '../../../../../tools/scripted-agent/pi.mjs')

/**
 * The gate, through a real agent process: the model asks for something, the policy answers, and the
 * workspace is the evidence. Nothing here is a mock — a denied call is a call that did not happen.
 */
interface GateOptions {
  level?: PermissionLevel
  rules?: PermissionRule[]
  answer?: ApprovalAnswer
}

const open = (options: GateOptions & { workspace: string; replies: unknown[] }) => {
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
  const events: RuntimeEvent[] = []
  const asked: ApprovalAsk[] = []
  const remembered: PermissionRule[] = []
  const state = { level: options.level ?? 'ask', rules: options.rules ?? [] }
  // The real broker, so the card's events are the ones the window would get, and the answer
  // travels the same path a person's click does.
  const broker = new ApprovalBroker({ emit: (event) => events.push(event) })

  const opened = ConversationRuntime.open({
    conversationId: 'gate',
    process: {
      file: SCRIPTED_AGENT,
      args: rpcArgs({ sessionsDirectory: sessionsRoot, sessionId: 'gate', name: 'gate' }),
      cwd: options.workspace,
      env: { ...process.env, ALPHA_FAUX_REPLIES: JSON.stringify(options.replies) },
    },
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
  // A prompt is answered as soon as the agent takes it: the run goes on behind it, and a test
  // waits for the run the way the window does — by its end.
  const ended = (): number =>
    events.filter((event) => event.type === 'turn_finished' || event.type === 'run_failed').length
  const run = async (text: string): Promise<void> => {
    const before = ended()
    await opened.runtime.prompt(text)
    for (let attempt = 0; attempt < 300 && ended() === before; attempt += 1) {
      await new Promise((done) => setTimeout(done, 20))
    }
  }
  return { ...opened, events, asked, remembered, state, sessionsRoot, run }
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

/** How a row learns why its call got past the gate: the decision lands on it after the row does. */
const approvalOf = (events: RuntimeEvent[], callId: string): ApprovalRecord | undefined => {
  const decided = events.find((event) => event.type === 'tool_decided' && event.callId === callId)
  return decided?.type === 'tool_decided' ? decided.approval : undefined
}

const callIdOf = (events: RuntimeEvent[]): string => {
  const started = events.find((event) => event.type === 'tool_started')
  return started?.type === 'tool_started' ? started.callId : ''
}

const writeCall = { tool: { name: 'write', args: { path: 'made.txt', content: 'written' } } }

describe('[runtime] a call the gate allows', () => {
  it('runs it, and the row says a person allowed it', async () => {
    const workspacePath = workspace()
    const { runtime, run, events, asked } = await open({
      workspace: workspacePath,
      replies: [writeCall, 'Wrote it.'],
      answer: { decision: 'once' },
    })

    await run('write the file')
    runtime.close()

    expect(readFileSync(join(workspacePath, 'made.txt'), 'utf8')).toBe('written')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ toolName: 'write', risk: 'write', summary: 'made.txt', level: 'ask' })
    expect(approvalOf(events, callIdOf(events))).toEqual({ kind: 'once', level: 'ask' })
  })

  it('asks before the call starts, so the card is up while nothing has run yet', async () => {
    const { runtime, run, events } = await open({ workspace: workspace(), replies: [writeCall, 'done'] })

    await run('write the file')
    await runtime.close()

    // The agent announces the call before it asks — the row appears, waiting — but what the call
    // would do has not happened yet: the answer comes first, the command second.
    const requested = events.findIndex((event) => event.type === 'approval_requested')
    const finished = events.findIndex((event) => event.type === 'tool_finished')
    expect(requested).toBeGreaterThanOrEqual(0)
    expect(requested).toBeLessThan(finished)
  })

  it('shows the proposed change on the card, so the user sees what they are approving', async () => {
    const { runtime, run, asked } = await open({ workspace: workspace(), replies: [writeCall, 'done'] })

    await run('write the file')
    runtime.close()

    expect(asked[0].diff).toContain('+written')
  })

  it('runs the next matching call without a card once the user says always', async () => {
    const workspacePath = workspace()
    const edit = { tool: { name: 'write', args: { path: 'src/main.ts', content: 'x' } } }
    const { runtime, run, asked, remembered } = await open({
      workspace: workspacePath,
      replies: [edit, edit, 'Both written.'],
      answer: { decision: 'always', scope: 'workspace' },
    })

    await run('write the file')
    runtime.close()

    expect(remembered).toHaveLength(1)
    expect(remembered[0]).toMatchObject({ scope: 'workspace', toolName: 'write', pattern: 'src/main.ts' })
    expect(asked).toHaveLength(1)
    expect(readFileSync(join(workspacePath, 'src/main.ts'), 'utf8')).toBe('x')
  })

  it('never asks at full access', async () => {
    const workspacePath = workspace()
    const { runtime, run, events, asked } = await open({
      workspace: workspacePath,
      replies: [writeCall, 'done'],
      level: 'full-access',
    })

    await run('write the file')
    runtime.close()

    expect(asked).toEqual([])
    expect(approvalOf(events, callIdOf(events))).toEqual({ kind: 'auto', level: 'full-access' })
  })

  it('lets a file write through at accept-edits but still asks before a command', async () => {
    const workspacePath = workspace()
    const { runtime, run, events, asked } = await open({
      workspace: workspacePath,
      level: 'accept-edits',
      replies: [writeCall, { tool: { name: 'bash', args: { command: 'echo hi' } } }, 'done'],
    })

    await run('write and run')
    await runtime.close()

    expect(asked.map((ask) => ask.toolName)).toEqual(['bash'])
    expect(approvalOf(events, callIdOf(events))).toEqual({ kind: 'auto', level: 'accept-edits' })
  })
})

describe('[runtime] a call the gate refuses', () => {
  it('blocks a write in plan without asking anyone, and says why', async () => {
    const workspacePath = workspace()
    const { runtime, run, events, asked } = await open({
      workspace: workspacePath,
      level: 'plan',
      replies: [writeCall, 'Understood.'],
    })

    await run('write the file')
    runtime.close()

    expect(asked).toEqual([])
    expect(existsSync(join(workspacePath, 'made.txt'))).toBe(false)
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' && finished.output).toContain('Plan')
    expect(approvalOf(events, callIdOf(events))?.kind).toBe('blocked')
  })

  it('does not run a denied call, and hands the reason to the model', async () => {
    const workspacePath = workspace()
    const { runtime, run, events } = await open({
      workspace: workspacePath,
      replies: [writeCall, 'I will not write it.'],
      answer: { decision: 'deny', reason: 'that file is generated' },
    })

    await run('write the file')
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
    const { runtime, run, events } = await open({
      workspace: workspace(),
      replies: [writeCall, 'ok'],
      answer: { decision: 'deny' },
    })

    await run('write the file')
    runtime.close()

    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' && finished.output).toContain('denied')
  })
})

describe('[runtime] revoking a remembered rule', () => {
  it('makes the next matching call ask again', async () => {
    const workspacePath = workspace()
    const edit = { tool: { name: 'write', args: { path: 'src/main.ts', content: 'x' } } }
    const { runtime, run, asked, remembered, state } = await open({
      workspace: workspacePath,
      replies: [edit, edit, 'Written.', edit, 'Written again.'],
      answer: { decision: 'always', scope: 'workspace' },
    })

    await run('write it')
    expect(asked).toHaveLength(1)

    state.rules = state.rules.filter((rule) => rule.id !== remembered[0].id)
    await run('write it again')
    await runtime.close()

    expect(asked).toHaveLength(2)
    expect(asked[1]).toMatchObject({ toolName: 'write', summary: 'src/main.ts' })
  })
})

describe('[runtime] changing the level', () => {
  it('applies to the next call without restarting the conversation', async () => {
    const workspacePath = workspace()
    const { runtime, run, events, state } = await open({
      workspace: workspacePath,
      level: 'plan',
      replies: [writeCall, 'I will not write it.', writeCall, 'Written now.'],
    })

    await run('write the file')
    expect(existsSync(join(workspacePath, 'made.txt'))).toBe(false)

    state.level = 'full-access'
    await run('now write it')
    await runtime.close()

    expect(readFileSync(join(workspacePath, 'made.txt'), 'utf8')).toBe('written')
    const finished = events.filter((event) => event.type === 'tool_finished')
    expect(finished[0]?.type === 'tool_finished' && finished[0].status).toBe('failed')
    expect(finished[1]?.type === 'tool_finished' && finished[1].status).toBe('ok')
  })
})
