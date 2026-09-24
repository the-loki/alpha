/**
 * A subagent inside a real runtime (ADR-0029): the `task` tool handed to the real gate and the real
 * workspace tools, a child agent on a scripted provider, and a person answering both questions —
 * the caller's own call and then the call the *subagent* makes. That second question is the whole
 * point of assembling the child out of the caller's plugins: the ladder is a `beforeToolCall` hook,
 * so a subagent's calls go through it because it was carried, not because anyone remembered to.
 *
 * The child's transcript is its own: it is nowhere on disk and no row of it is in the parent's, which
 * is why what the window hears about a subagent's call is a decision it has no row for.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type AlphaPlugin, assembleAgent, historyOf } from '@alpha/agent'
import { aModel, errorStream, scriptedModels, textStream, toolUseStream } from '@alpha/agent/testing'
import {
  type ApprovalAsk,
  type ApprovalRecord,
  emptyTranscript,
  type PermissionLevel,
  type PermissionRule,
  type RuntimeEvent,
  reduceTranscript,
  totalUsage,
  type Undef,
} from '@alpha/domain'
import type { ApprovalAnswer, PermissionPorts } from '@alpha/gate'
import { createGatePlugin, createSubagentsPlugin, createWorkspaceToolsPlugin } from '@alpha/internal-plugins'
import { DecisionLog, SessionStore, tipPath } from '@alpha/sessions'
import { describe, expect, it } from 'vitest'
import { ConversationRuntime } from './conversation-runtime.ts'

/**
 * A runtime of the production shape over a scripted provider: the workspace tools, the gate at the
 * level the test names, and the subagents plugin reading its plugins through the same array.
 */
const gated = (drives: Array<() => ReturnType<typeof textStream>>, level: PermissionLevel = 'ask') => {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const store = new SessionStore(mkdtempSync(join(tmpdir(), 'alpha-sessions-')))
  // The ledger the row's "how it got past" is read from, as the production wiring passes it.
  const ledger = new DecisionLog(mkdtempSync(join(tmpdir(), 'alpha-decisions-'))).opened('c1')
  const asked: ApprovalAsk[] = []
  const waiters: Array<(answer: ApprovalAnswer) => void> = []
  const ports: PermissionPorts = {
    level: () => level,
    rules: () => [] as PermissionRule[],
    remember: () => undefined,
    ask: async (_conversationId, ask) => {
      asked.push(ask)
      return new Promise<ApprovalAnswer>((resolve) => waiters.push(resolve))
    },
  }

  const events: RuntimeEvent[] = []
  const decisions = new Map<string, ApprovalRecord>()
  let runtime: Undef<ConversationRuntime>
  const plugins: AlphaPlugin[] = [
    createWorkspaceToolsPlugin({ workspacePath: workspace }),
    createGatePlugin({
      conversationId: 'c1',
      workspacePath: workspace,
      permissions: ports,
      note: (callId, record) => {
        decisions.set(callId, record)
        ledger.note(callId, record)
      },
      onDecided: (callId, record) => runtime?.decided(callId, record),
    }),
  ]
  // One scripted runtime for both agents: the drives are consumed in the order the requests come.
  const models = scriptedModels(drives)
  plugins.push(
    createSubagentsPlugin({
      plugins: () => plugins,
      models,
      model: () => aModel(),
      systemPrompt: async (subagent) => `you are scripted\n\n${subagent.prompt}`,
      onUsage: (usage) => runtime?.recordSubagentUsage(usage),
    }),
  )
  const history = store.entries('c1', workspace)
  const agent = assembleAgent({
    models,
    model: aModel(),
    plugins,
    systemPrompt: 'you are scripted',
    sessionId: 'c1',
    messages: historyOf(tipPath(history.entries, history.leafId)),
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
    decisions,
    asked,
    store,
    workspace,
    answer: (answer: ApprovalAnswer) => waiters.shift()?.(answer),
  }
}

const waitedFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 300 && !condition(); attempt += 1) {
    await new Promise((done) => setTimeout(done, 10))
  }
}

const recordsOf = (events: RuntimeEvent[]): ApprovalRecord[] =>
  events.flatMap((event) => (event.type === 'tool_decided' ? [event.approval] : []))

describe('[runtime] a subagent inside a conversation', () => {
  it('counts delegated model calls in the parent live total and session', async () => {
    const f = gated(
      [
        () => toolUseStream('task', { agent: 'explore', prompt: 'find the parser' }),
        () => textStream('The parser is named pi.'),
        () => textStream('Done.'),
      ],
      'full-access',
    )

    await f.runtime.prompt('delegate it')
    expect(await f.runtime.settle()).toBe(true)
    const live = f.events.reduce(reduceTranscript, emptyTranscript('c1'))
    expect(totalUsage(live).totalTokens).toBe(6)
    expect(f.store.usage('c1', f.workspace).totalTokens).toBe(6)
    await f.runtime.close()
  })

  it('keeps both parent and child usage when their model calls fail', async () => {
    const f = gated(
      [
        () => toolUseStream('task', { agent: 'explore', prompt: 'find the parser' }),
        () => errorStream('child failed', 'error'),
        () => errorStream('parent failed', 'error'),
      ],
      'full-access',
    )

    await f.runtime.prompt('delegate it')
    expect(await f.runtime.settle()).toBe(false)
    const live = f.events.reduce(reduceTranscript, emptyTranscript('c1'))
    expect(live.status).toBe('failed')
    expect(totalUsage(live).totalTokens).toBe(6)
    expect(f.store.usage('c1', f.workspace).totalTokens).toBe(6)
    await f.runtime.close()
  })

  it('runs the subagent on the caller’s plugins, so the gate asks about the subagent’s own call', async () => {
    const f = gated([
      () => toolUseStream('task', { agent: 'builder', prompt: 'run the build' }),
      () => toolUseStream('bash', { command: 'echo inner' }),
      () => textStream('The call was refused, so nothing ran.'),
      () => textStream('Done.'),
    ])

    await f.runtime.prompt('delegate it')
    // The caller's own call first: handing work to a subagent is an execute-class call too.
    await waitedFor(() => f.asked.length > 0)
    expect(f.asked[0]).toMatchObject({ toolName: 'task', risk: 'execute' })
    f.answer({ decision: 'once' })

    // Then the subagent's call: the same chain of blocks, asked about the same way.
    await waitedFor(() => f.asked.length > 1)
    expect(f.asked[1]).toMatchObject({ toolName: 'bash', risk: 'execute' })
    f.answer({ decision: 'deny', reason: 'not that, not now' })

    await f.runtime.settle()
    await f.runtime.close()

    expect(recordsOf(f.events)).toMatchObject([
      { kind: 'once', level: 'ask' },
      { kind: 'denied', level: 'ask', reason: 'not that, not now' },
    ])
  })

  it('leaves one row in the parent: the task, and what the subagent answered', async () => {
    const f = gated([
      () => toolUseStream('task', { agent: 'explore', prompt: 'find the parser' }),
      () => toolUseStream('read', { path: 'notes.txt' }),
      () => textStream('The parser is named pi.'),
      () => textStream('Done.'),
    ])

    await f.runtime.prompt('delegate it')
    await waitedFor(() => f.asked.length > 0)
    f.answer({ decision: 'once' })
    await f.runtime.settle()

    const rows = f.store
      .transcript('c1', f.workspace, f.decisions)
      .flatMap((message) => message.blocks.filter((block) => block.kind === 'tool'))
    await f.runtime.close()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'task', status: 'ok', output: 'The parser is named pi.' })
    // Two decisions were made — the caller's task call, and the read call the subagent made on its
    // own — and the window heard both while the transcript gained one row: the call that had no row
    // is a decision the reducer finds nothing to put it on, which is where a subagent's work goes.
    expect(recordsOf(f.events)).toMatchObject([
      { kind: 'once', level: 'ask' },
      { kind: 'auto', level: 'ask' },
    ])
    expect(f.decisions.size).toBeGreaterThan(0)
  })
})
