import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AlphaPlugin } from '@alpha/agent'
import { assembleAgent } from '@alpha/agent'
import { aModel, scriptedModels, textStream, toolUseStream } from '@alpha/agent/testing'
import type { ApprovalAsk, ApprovalRecord, PermissionLevel, PermissionRule, RuntimeEvent, Undef } from '@alpha/domain'
import type { ApprovalAnswer, PermissionPorts } from '@alpha/gate'
import { contextOf } from '@alpha/history'
import { createGatePlugin, createWorkspaceToolsPlugin } from '@alpha/internal-plugins'
import { SessionStore, tipPath } from '@alpha/sessions'
import { describe, expect, it } from 'vitest'
import { ConversationRuntime } from './conversation-runtime.ts'

/**
 * The gate plugin (ADR-0025): the ladder wrapped as a `beforeToolCall` hook, over the real workspace
 * tools, on a real assembled agent whose provider streams from a script. What the model reads when
 * a call is refused, what the session keeps, and what the window is told are the three things the
 * old RPC gate had to braid together — here they are one plugin deep.
 */

interface GateOptions {
  level?: PermissionLevel
  rules?: PermissionRule[]
  drives: Array<() => ReturnType<typeof textStream>>
}

const gated = (options: GateOptions) => {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  writeFileSync(join(workspace, 'notes.txt'), 'the parser is named pi\n')
  const store = new SessionStore(mkdtempSync(join(tmpdir(), 'alpha-sessions-')))
  const state = { level: options.level ?? ('ask' as PermissionLevel), rules: options.rules ?? [] }
  const asked: ApprovalAsk[] = []
  const remembered: PermissionRule[] = []
  const decisions = new Map<string, ApprovalRecord>()
  const waiters: Array<(answer: ApprovalAnswer) => void> = []
  const ports: PermissionPorts = {
    level: () => state.level,
    rules: () => state.rules,
    remember: (rule) => {
      remembered.push(rule)
      state.rules = [...state.rules, rule]
    },
    ask: async (_conversationId, ask) => {
      asked.push(ask)
      return new Promise<ApprovalAnswer>((resolve) => waiters.push(resolve))
    },
  }

  const events: RuntimeEvent[] = []
  // The production wiring (assemble-runtime.ts): the runtime does not exist until the plugins do,
  // so the gate's announcements are bound late and travel through it.
  let runtime: Undef<ConversationRuntime>
  const plugins: AlphaPlugin[] = [
    createWorkspaceToolsPlugin({ workspacePath: workspace }),
    createGatePlugin({
      conversationId: 'c1',
      workspacePath: workspace,
      permissions: ports,
      note: (callId, record) => decisions.set(callId, record),
      onDecided: (callId, record) => runtime?.decided(callId, record),
    }),
  ]
  const models = scriptedModels(options.drives)
  const history = store.entries('c1', workspace)
  const agent = assembleAgent({
    models,
    model: aModel(),
    plugins,
    systemPrompt: 'gated',
    sessionId: 'c1',
    messages: contextOf(tipPath(history.entries, history.leafId)),
  })
  runtime = new ConversationRuntime({
    conversationId: 'c1',
    agent,
    models,
    session: { id: 'c1', workspacePath: workspace },
    store,
    plugins,
    emit: (event) => events.push(event),
  })

  return {
    runtime,
    events,
    store,
    workspace,
    asked,
    remembered,
    decisions,
    answer: (answer: ApprovalAnswer) => waiters.shift()?.(answer),
  }
}

const typesOf = (events: RuntimeEvent[]): string[] => events.map((event) => event.type)

const waitedFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 300 && !condition(); attempt += 1) {
    await new Promise((done) => setTimeout(done, 10))
  }
}

const recordsOf = (events: RuntimeEvent[]): ApprovalRecord[] =>
  events.flatMap((event) => (event.type === 'tool_decided' ? [event.approval] : []))

const finishedOf = (events: RuntimeEvent[]): RuntimeEvent & { type: 'tool_finished' } => {
  const finished = events.find((event) => event.type === 'tool_finished')
  if (finished === undefined || finished.type !== 'tool_finished') throw new Error('no tool_finished event')
  return finished
}

/** The persisted tool result: the entry the store keeps for the call the agent made. */
const toolResultOf = (store: SessionStore, workspace: string): Record<string, unknown> => {
  const read = store.entries('c1', workspace)
  const entry = tipPath(read.entries, read.leafId).find((entry) => entry.message?.role === 'toolResult')
  return (entry?.message ?? {}) as Record<string, unknown>
}

describe('[runtime] the gate plugin', () => {
  it('waits on the person for a risky call, and their once lets it run', async () => {
    const f = gated({
      drives: [() => toolUseStream('bash', { command: 'echo gate-passed' }), () => textStream('Done.')],
    })

    await f.runtime.prompt('run it')
    await waitedFor(() => f.asked.length > 0)
    expect(f.asked[0]).toMatchObject({ toolName: 'bash', risk: 'execute' })
    // The question stands: nothing has run and nothing has finished while it waits.
    await new Promise((done) => setTimeout(done, 50))
    expect(typesOf(f.events)).not.toContain('tool_finished')

    f.answer({ decision: 'once' })
    await f.runtime.settle()
    await f.runtime.close()

    const finished = finishedOf(f.events)
    expect(finished.status).toBe('ok')
    expect(finished.output).toContain('gate-passed')
    expect(toolResultOf(f.store, f.workspace)).toMatchObject({ role: 'toolResult', isError: false })
    expect(recordsOf(f.events)).toEqual([{ kind: 'once', level: 'ask' }])
  })

  it('a denial becomes the sentence the model reads, and the record says denied', async () => {
    const f = gated({
      drives: [() => toolUseStream('bash', { command: 'rm -rf build' }), () => textStream('Understood.')],
    })

    await f.runtime.prompt('clean up')
    await waitedFor(() => f.asked.length > 0)
    f.answer({ decision: 'deny', reason: 'not that directory' })
    await f.runtime.settle()
    await f.runtime.close()

    const finished = finishedOf(f.events)
    expect(finished.status).toBe('failed')
    expect(finished.output).toBe('not that directory')
    expect(toolResultOf(f.store, f.workspace)).toMatchObject({ role: 'toolResult', isError: true })
    expect(recordsOf(f.events)).toEqual([{ kind: 'denied', level: 'ask', reason: 'not that directory' }])
    expect(f.decisions.get('call-1')?.kind).toBe('denied')
  })

  it('an always writes the rule, and the identical call after it is allowed by rule without asking', async () => {
    const f = gated({
      drives: [
        () => toolUseStream('bash', { command: 'echo once-more' }),
        () => textStream('mid'),
        () => toolUseStream('bash', { command: 'echo once-more' }),
        () => textStream('done'),
      ],
    })

    await f.runtime.prompt('run it twice')
    await waitedFor(() => f.asked.length > 0)
    f.answer({ decision: 'always', scope: 'conversation' })
    await f.runtime.settle()
    await f.runtime.prompt('and again')
    await f.runtime.settle()
    await f.runtime.close()

    expect(f.asked).toHaveLength(1)
    expect(f.remembered).toHaveLength(1)
    expect(f.remembered[0]).toMatchObject({ toolName: 'bash', pattern: 'echo once-more', conversationId: 'c1' })
    expect(recordsOf(f.events).map((record) => record.kind)).toEqual(['always', 'rule'])
    expect(f.events.filter((event) => event.type === 'tool_finished')).toHaveLength(2)
  })

  it('announces how an auto-allowed call got past, too', async () => {
    const f = gated({ drives: [() => toolUseStream('read', { path: 'notes.txt' }), () => textStream('Read it.')] })

    await f.runtime.prompt('read the notes')
    await f.runtime.settle()
    await f.runtime.close()

    expect(f.asked).toEqual([])
    expect(recordsOf(f.events)).toEqual([{ kind: 'auto', level: 'ask' }])
    expect(finishedOf(f.events).output).toContain('the parser is named pi')
  })
})
