import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assembleAgent } from '@alpha/agent'
import { aModel, errorStream, scriptedModels, textStream } from '@alpha/agent/testing'
import type { RuntimeEvent } from '@alpha/domain'
import { alignedHistoryOf } from '@alpha/history'
import { createCompactionPlugin } from '@alpha/internal-plugins'
import { SessionStore, tipPath } from '@alpha/sessions'
import type { Agent } from '@earendil-works/pi-agent-core'
import type { AssistantMessageEventStream } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { ConversationRuntime } from './conversation-runtime.ts'

/** coding-agent's compaction policy (ADR-0025) on Alpha's base: after a run, when the context
 * nears the model's window, the messages are summarized through the model, the live agent is
 * rewritten, the store takes a compaction entry, and the window hears about it. The seam is the
 * runtime's: a real assembled agent over Alpha's store, only the provider's answers scripted. */

/** A window small enough that one scripted turn (two tokens) is already an overflow. */
const tinyWindowModel = (): ReturnType<typeof aModel> => ({ ...aModel(), contextWindow: 5 })

interface FixtureOptions {
  drives: Array<() => AssistantMessageEventStream>
  model?: () => ReturnType<typeof aModel>
  settings?: { reserveTokens: number; keepRecentTokens: number }
}

const fixture = (options: FixtureOptions) => {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const store = new SessionStore(mkdtempSync(join(tmpdir(), 'alpha-sessions-')))
  const models = scriptedModels(options.drives, [(options.model ?? aModel)()])
  const announcements: Array<{ summary: string; replaced: number; at: number }> = []
  const events: RuntimeEvent[] = []
  const holder: { agent?: Agent } = {}
  const plugin = createCompactionPlugin({
    conversationId: 'c1',
    workspacePath: workspace,
    sessionId: () => holder.agent?.sessionId ?? 'c1',
    store,
    models,
    agent: () => holder.agent,
    model: () => holder.agent?.state.model,
    onCompacted: (compacted) => announcements.push(compacted),
    settings: { enabled: true, ...(options.settings ?? { reserveTokens: 4, keepRecentTokens: 0 }) },
  })
  const agent = assembleAgent({
    models,
    model: models.getModel('p', 'm') ?? aModel(),
    plugins: [plugin],
    systemPrompt: 'you are scripted',
    sessionId: 'c1',
  })
  holder.agent = agent
  const runtime = new ConversationRuntime({
    conversationId: 'c1',
    agent,
    models,
    session: { id: 'c1', workspacePath: workspace },
    store,
    plugins: [plugin],
    compact: () => plugin.compact(),
    emit: (event) => events.push(event),
  })
  return { runtime, agent, plugin, store, workspace, announcements, events }
}

const ranTurn = async (setup: ReturnType<typeof fixture>, text: string): Promise<void> => {
  await setup.runtime.prompt(text)
  await setup.runtime.settle()
  await setup.runtime.close()
}

const pathOf = (setup: ReturnType<typeof fixture>): ReturnType<typeof tipPath> => {
  const read = setup.store.entries('c1', setup.workspace)
  return tipPath(read.entries, read.leafId)
}

describe('compacting on the threshold', () => {
  it('an overflow summarizes through the model, rewrites the agent, and writes the entry', async () => {
    const setup = fixture({
      drives: [() => textStream('Hello there.'), () => textStream('They were fixing a parser.')],
      model: tinyWindowModel,
    })

    await ranTurn(setup, 'fix the parser')

    expect(setup.announcements).toEqual([
      { summary: 'They were fixing a parser.', replaced: 2, at: expect.any(Number) },
    ])
    const last = pathOf(setup).at(-1)
    expect(last).toMatchObject({ type: 'compaction', summary: 'They were fixing a parser.' })
    // Nothing was kept: the summary stands in for the whole conversation.
    expect(last?.firstKeptEntryId).toBeUndefined()
    // The live agent now starts at the summary, system prompt kept in front of it.
    expect(setup.agent.state.messages).toHaveLength(2)
    expect(setup.agent.state.messages[0]?.role).toBe('system')
    expect(setup.agent.state.messages[1]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'They were fixing a parser.' }],
    })
    const live = await setup.runtime.transcript()
    expect(live.at(-1)).toMatchObject({
      role: 'assistant',
      blocks: [{ kind: 'compaction', summary: 'They were fixing a parser.', replaced: 2 }],
    })
  })

  it('the kept tail stays as it was, and the entry names where keeping begins', async () => {
    const setup = fixture({
      drives: [() => textStream('Hello there.'), () => textStream('They were fixing a parser.')],
      model: tinyWindowModel,
      settings: { reserveTokens: 4, keepRecentTokens: 4 },
    })

    await ranTurn(setup, 'fix the parser')

    const path = pathOf(setup)
    const keptId = path.at(-2)?.id
    expect(path.at(-1)).toMatchObject({ type: 'compaction', firstKeptEntryId: keptId })
    expect(setup.announcements[0]?.replaced).toBe(1)
    // The kept tail stays in the live agent, after the summary that replaced the rest.
    expect(setup.agent.state.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant'])
    expect(JSON.stringify(setup.agent.state.messages.at(-1))).toContain('Hello there.')
  })

  it('under the threshold nothing happens: no announcement, no entry', async () => {
    const setup = fixture({ drives: [() => textStream('Hello there.')] })

    await ranTurn(setup, 'fix the parser')

    expect(setup.announcements).toEqual([])
    expect(setup.store.entries('c1', setup.workspace).entries).toHaveLength(2)
  })

  it('an aborted run is never compacted', async () => {
    const setup = fixture({
      drives: [() => errorStream('stopped by the person', 'aborted')],
      model: tinyWindowModel,
    })

    await ranTurn(setup, 'fix the parser')

    expect(setup.announcements).toEqual([])
    expect(setup.store.entries('c1', setup.workspace).entries).toHaveLength(2)
    expect(pathOf(setup).at(-1)?.message).toMatchObject({ role: 'assistant', stopReason: 'aborted' })
  })
})

describe('compacting by hand', () => {
  it('compact() runs the same path under the threshold and answers whether it happened', async () => {
    const setup = fixture({
      drives: [() => textStream('Hello there.'), () => textStream('They were fixing a parser.')],
    })

    await ranTurn(setup, 'fix the parser')
    await expect(setup.runtime.compact()).resolves.toBe(true)

    expect(setup.announcements.map((one) => one.summary)).toEqual(['They were fixing a parser.'])
    expect(pathOf(setup).at(-1)?.type).toBe('compaction')
  })

  it('compact() on a session with nothing to summarize answers false', async () => {
    const setup = fixture({ drives: [] })

    await expect(setup.runtime.compact()).resolves.toBe(false)
    expect(setup.announcements).toEqual([])
    expect(setup.store.entries('c1', setup.workspace).entries).toHaveLength(0)
  })
})

describe('the fold a reopened conversation takes', () => {
  it('a new context over the same store folds the same way, and the transcript says so once', async () => {
    const setup = fixture({
      drives: [() => textStream('Hello there.'), () => textStream('They were fixing a parser.')],
      model: tinyWindowModel,
    })

    await ranTurn(setup, 'fix the parser')

    const read = setup.store.entries('c1', setup.workspace)
    const refolded = alignedHistoryOf(tipPath(read.entries, read.leafId))
    expect(refolded.messages).toHaveLength(1)
    expect(refolded.messages[0]).toMatchObject({ role: 'user' })
    expect(JSON.stringify(refolded.messages[0])).toContain('They were fixing a parser.')

    const transcript = setup.store.transcript('c1', setup.workspace)
    const blocks = transcript.flatMap((message) => message.blocks.filter((block) => block.kind === 'compaction'))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ kind: 'compaction', summary: 'They were fixing a parser.', replaced: 2 })
  })
})
