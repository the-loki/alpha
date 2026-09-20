import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ApprovalAsk, type RuntimeEvent, textOfContent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { rpcArgs } from '../agent-cli/rpc.ts'
import { ConversationRuntime, type PermissionPorts } from './conversation-runtime.ts'
import type { ApprovalAnswer } from './gate.ts'

/**
 * The seam that matters now: a real agent process speaking the documented protocol, Alpha's client
 * reading it, and the translation that turns what the agent says into what the window draws. Only
 * the agent's own answers are scripted — the process, the pipes, the session, the gate's round trip
 * and the tools are the real thing, which is exactly what a mock would not show.
 */
const SCRIPTED_AGENT = join(import.meta.dirname, '../../../../tools/scripted-agent/pi.mjs')

const openRuntime = (
  options: {
    id?: string
    replies?: unknown[]
    answers?: ApprovalAnswer[]
    level?: string
    workspace?: string
    sessionsRoot?: string
    env?: Record<string, string>
  } = {},
) => {
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const sessionsRoot = options.sessionsRoot ?? mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
  const events: RuntimeEvent[] = []
  const asked: ApprovalAsk[] = []
  const answers = options.answers ?? []
  const id = options.id ?? 'c1'
  const permissions: PermissionPorts = {
    level: () => (options.level ?? 'ask') as never,
    rules: () => [],
    remember: () => undefined,
    ask: (_conversationId, ask) => {
      asked.push(ask)
      return Promise.resolve(answers.shift() ?? { decision: 'once' })
    },
  }
  const { runtime } = ConversationRuntime.open({
    conversationId: id,
    process: {
      file: SCRIPTED_AGENT,
      args: rpcArgs({ sessionsDirectory: sessionsRoot, sessionId: id, name: 'a chat' }),
      cwd: workspace,
      env: {
        ...process.env,
        ALPHA_FAUX_REPLIES: JSON.stringify(options.replies ?? ['Scripted reply.']),
        ...options.env,
      },
    },
    permissions,
    emit: (event) => events.push(event),
  })
  return { runtime, events, sessionsRoot, workspace, asked }
}

const typesOf = (events: RuntimeEvent[]): string[] => events.map((event) => event.type)

const deltasOf = (events: RuntimeEvent[]): string =>
  events
    .filter((event) => event.type === 'assistant_text_delta')
    .map((event) => event.delta)
    .join('')

const rowOf = (events: RuntimeEvent[], type: string) => events.filter((event) => event.type === type)

const settle = async (events: RuntimeEvent[], kind: string): Promise<void> => {
  for (let attempt = 0; attempt < 200 && !typesOf(events).includes(kind); attempt += 1) {
    await new Promise((done) => setTimeout(done, 20))
  }
}

describe('[runtime] a conversation turn, driven by the agent', () => {
  it('streams the agent’s deltas as the text the window shows, thinking included', async () => {
    const { runtime, events } = openRuntime({ replies: [{ thinking: 'weighing it', text: 'Hello there.' }] })

    await runtime.prompt('hi')
    await settle(events, 'turn_finished')
    await runtime.close()

    expect(typesOf(events)).toContain('assistant_message_started')
    expect(typesOf(events)).toContain('assistant_message_finished')
    expect(deltasOf(events)).toBe('Hello there.')
    expect(typesOf(events)).toContain('assistant_thinking_delta')
  })

  it('finishes the assistant message before the turn ends', async () => {
    const { runtime, events } = openRuntime()

    await runtime.prompt('hi')
    await settle(events, 'turn_finished')
    await runtime.close()

    expect(typesOf(events).indexOf('assistant_message_finished')).toBeLessThan(typesOf(events).indexOf('turn_finished'))
  })

  it('reports the person’s own message as the message they sent', async () => {
    const { runtime, events } = openRuntime()

    await runtime.prompt('fix the parser')
    await settle(events, 'turn_finished')
    await runtime.close()

    const messages = events.filter((event) => event.type === 'user_message')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.message.blocks).toEqual([{ kind: 'text', text: 'fix the parser' }])
  })

  it('reports what the run spent, as numbers the window can add up', async () => {
    const { runtime, events } = openRuntime({ replies: ['Noted.'] })

    await runtime.prompt('remember this')
    await settle(events, 'turn_finished')
    await runtime.close()

    const usage = events.find((event) => event.type === 'usage_recorded')
    expect(usage?.type === 'usage_recorded' ? usage.usage.totalTokens : 0).toBeGreaterThan(0)
  })

  it('runs a second turn in the same conversation', async () => {
    const { runtime, events } = openRuntime({ replies: ['first', 'second'] })

    await runtime.prompt('one')
    await settle(events, 'turn_finished')
    await runtime.prompt('two')
    await settle(events, 'turn_finished')
    await runtime.close()

    expect(rowOf(events, 'user_message')).toHaveLength(2)
    expect(rowOf(events, 'turn_finished')).toHaveLength(2)
  })

  it('says a run failed when the message that ended it says so', async () => {
    const { runtime, events } = openRuntime({ replies: [{ error: 'the provider hung up' }] })

    await runtime.prompt('hi')
    await settle(events, 'run_failed')
    await runtime.close()

    const failure = events.find((event) => event.type === 'run_failed')
    expect(failure?.message).toBe('the provider hung up')
  })

  it('marks the message interrupted when the run was stopped, without the agent dying', async () => {
    const { runtime, events } = openRuntime({
      replies: ['a long answer that is still being written'],
      env: { ALPHA_FAUX_TOKEN_SIZE: '4', ALPHA_FAUX_TOKENS_PER_SECOND: '100' },
    })
    await runtime.prompt('hi')
    await settle(events, 'assistant_message_started')

    await runtime.abort()
    await settle(events, 'turn_finished')
    await runtime.close()

    expect(typesOf(events)).toContain('assistant_message_finished')
    // A stop is a turn that ended, not a failure: the agent answered the abort and kept the part
    // that had arrived, which is only visible while the process is still alive to say so.
    expect(typesOf(events)).not.toContain('run_failed')
    expect(runtime.isRunning()).toBe(false)
  })

  it('a message steered into a running turn arrives in it, as a user entry', async () => {
    const { runtime, events } = openRuntime({
      replies: [{ text: 'a long answer that is still being written' }],
      env: { ALPHA_FAUX_TOKEN_SIZE: '4', ALPHA_FAUX_TOKENS_PER_SECOND: '100' },
    })
    await runtime.prompt('hi')
    await settle(events, 'assistant_message_started')

    await runtime.steer('actually, this instead')
    await settle(events, 'turn_finished')
    const said = await runtime.userEntries()
    await runtime.close()
    const texts = said.map((entry) => textOfContent(entry.message?.content))
    expect(texts).toContain('hi')
    expect(texts).toContain('actually, this instead')
  })
})

describe('[runtime] the ledger rows the agent’s calls become', () => {
  it('runs a call the gate allows and shows what it printed', async () => {
    const { runtime, events, workspace } = openRuntime({
      replies: [
        { text: 'Writing it.', tool: { name: 'write', args: { path: 'made.txt', content: 'hello' } } },
        'Done.',
      ],
    })

    await runtime.prompt('write the file')
    await settle(events, 'turn_finished')
    await runtime.close()

    const started = events.find((event) => event.type === 'tool_started')
    expect(started).toMatchObject({ name: 'write', args: { path: 'made.txt' } })
    expect(events.find((event) => event.type === 'tool_output')).toMatchObject({ output: 'Wrote made.txt' })
    expect(events.find((event) => event.type === 'tool_finished')).toMatchObject({ status: 'ok' })
    // The tool ran for real, in the conversation's workspace.
    expect(readFileSync(join(workspace, 'made.txt'), 'utf8')).toBe('hello')
  })

  it('shows a call refused by the ladder as failed, carrying Alpha’s words, and runs nothing', async () => {
    const { runtime, events, workspace, asked } = openRuntime({
      level: 'plan',
      replies: [{ tool: { name: 'write', args: { path: 'made.txt', content: 'hello' } } }, 'Understood.'],
    })

    await runtime.prompt('write the file')
    await settle(events, 'turn_finished')
    await runtime.close()

    // At the Plan level the ladder refuses without asking anybody.
    expect(asked).toHaveLength(0)
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' ? finished.status : '').toBe('failed')
    expect(finished?.type === 'tool_finished' ? finished.output : '').toContain('Plan')
    expect(existsSync(join(workspace, 'made.txt'))).toBe(false)
  })

  it('asks the person when the ladder says to ask, and carries their refusal back', async () => {
    const { runtime, events, asked, workspace } = openRuntime({
      replies: [{ tool: { name: 'write', args: { path: 'made.txt', content: 'hello' } } }, 'Understood.'],
      answers: [{ decision: 'deny', reason: 'that file is generated' }],
    })

    await runtime.prompt('write the file')
    await settle(events, 'turn_finished')
    await runtime.close()

    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ toolName: 'write', detail: 'made.txt' })
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' ? finished.output : '').toBe('that file is generated')
    expect(existsSync(join(workspace, 'made.txt'))).toBe(false)
  })
})

describe('[runtime] the session the agent owns', () => {
  it('reads the conversation back as the messages that were said', async () => {
    const first = openRuntime({ replies: ['Noted.'] })
    await first.runtime.prompt('remember this')
    await settle(first.events, 'turn_finished')
    await first.runtime.close()

    // Reopening is naming the conversation: the agent finds the session it already wrote.
    const second = openRuntime({
      id: 'c1',
      replies: ['Noted.'],
      workspace: first.workspace,
      sessionsRoot: first.sessionsRoot,
    })
    const messages = await second.runtime.transcript()
    await second.runtime.close()

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages[0]?.blocks).toEqual([{ kind: 'text', text: 'remember this' }])
    expect(messages[1]?.blocks).toEqual([{ kind: 'text', text: 'Noted.' }])
  })

  it('is empty for a conversation that has not been used', async () => {
    const { runtime } = openRuntime()
    expect(await runtime.transcript()).toEqual([])
    expect(await runtime.usage()).toMatchObject({ totalTokens: 0 })
    await runtime.close()
  })
})
