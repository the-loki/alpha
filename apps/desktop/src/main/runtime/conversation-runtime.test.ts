import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AlphaPlugin } from '@alpha/agent'
import { assembleAgent, historyOf } from '@alpha/agent'
import { aModel, scriptedModels, textStream, toolNamed, toolUseStream } from '@alpha/agent/testing'
import { emptyTranscript, type RuntimeEvent, reduceTranscript, totalUsage, type Undef } from '@alpha/domain'
import { createRetryPlugin, createWorkspaceToolsPlugin, type RetryPlugin } from '@alpha/internal-plugins'
import { SessionStore, sessionDirectoryFor, tipPath, WorkspaceChangeLog } from '@alpha/sessions'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import { describe, expect, it, vi } from 'vitest'
import { ConversationRuntime } from './conversation-runtime.ts'

/**
 * The seam now that the agent is embedded (ADR-0025): a real assembled agent driven by a real
 * pi-ai `Models` whose provider streams from a script — dispatch, auth resolution, tools and all —
 * over Alpha's own session store. Only the provider's answers are scripted, which is exactly what
 * a mock of the agent would not show.
 */

interface OpenOptions {
  id?: string
  drives?: Array<() => AssistantMessageEventStream>
  tools?: AgentTool[]
  /** Opens with nothing assembled: no model, so nothing can run and everything can be read. */
  unAssembled?: boolean
  store?: SessionStore
  workspace?: string
  /** The retry policy the turn is driven with, wired where the annotation reads it. */
  retry?: RetryPlugin
  changes?: WorkspaceChangeLog
}

const openRuntime = (options: OpenOptions = {}) => {
  const id = options.id ?? 'c1'
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const store = options.store ?? new SessionStore(mkdtempSync(join(tmpdir(), 'alpha-sessions-')))
  const models = scriptedModels(options.drives ?? [])
  const plugins: AlphaPlugin[] =
    options.tools === undefined ? [] : [{ name: 'test-tools', tools: () => options.tools ?? [] }]
  if (options.retry !== undefined) plugins.push(options.retry)
  // The manager loads the session's history and hands it to the assembly; the fixture does the same.
  const history = store.entries(id, workspace)
  const agent = options.unAssembled
    ? undefined
    : assembleAgent({
        models,
        model: aModel(),
        plugins,
        systemPrompt: 'you are scripted',
        sessionId: id,
        messages: historyOf(tipPath(history.entries, history.leafId)),
      })
  const events: RuntimeEvent[] = []
  const runtime = new ConversationRuntime({
    conversationId: 'c1',
    agent,
    models,
    session: { id, workspacePath: workspace },
    store,
    plugins,
    retry: options.retry,
    changes: options.changes,
    emit: (event) => events.push(event),
  })
  return { runtime, events, store, workspace, agent, id }
}

const typesOf = (events: RuntimeEvent[]): string[] => events.map((event) => event.type)

const deltasOf = (events: RuntimeEvent[]): string =>
  events
    .filter((event) => event.type === 'assistant_text_delta')
    .map((event) => event.delta)
    .join('')

const rowOf = (events: RuntimeEvent[], type: string) => events.filter((event) => event.type === type)

const waitedFor = async (events: RuntimeEvent[], kind: string): Promise<void> => {
  for (let attempt = 0; attempt < 300 && !typesOf(events).includes(kind); attempt += 1) {
    await new Promise((done) => setTimeout(done, 10))
  }
}

/** The text of one session's message entries, in transcript order: what a reader would see. */
const textsOf = (store: SessionStore, workspace: string, sessionId = 'c1'): string[] => {
  const read = store.entries(sessionId, workspace)
  return tipPath(read.entries, read.leafId).flatMap((entry) => {
    const content = entry.message?.content
    return Array.isArray(content)
      ? content.flatMap((part) =>
          typeof part === 'object' && part !== null && 'text' in part ? [String(part.text)] : [],
        )
      : []
  })
}

/** An entry's message as it arrived, for shapes the transcript's own reading does not draw. */
const messageOf = (store: SessionStore, workspace: string, at: number): Record<string, unknown> => {
  const read = store.entries('c1', workspace)
  const entry = tipPath(read.entries, read.leafId)[at]
  return (entry?.message ?? {}) as Record<string, unknown>
}

const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}

const partialAssistant = (text: string, stopReason: AssistantMessage['stopReason']): AssistantMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
  api: 'openai-completions',
  provider: 'p',
  model: 'm',
  usage,
  stopReason,
  timestamp: Date.now(),
})

/** One scripted drive that ends the way a provider failure or an abort does. */
const failingStream = (message: string, reason: 'error' | 'aborted'): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream()
  stream.push({ type: 'error', reason, error: { ...partialAssistant('', reason), errorMessage: message } })
  return stream
}

const partialFailure = (text: string, message: string): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream()
  stream.push({ type: 'start', partial: partialAssistant('', 'pending') })
  stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: partialAssistant(text, 'pending') })
  stream.push({ type: 'error', reason: 'error', error: { ...partialAssistant(text, 'error'), errorMessage: message } })
  return stream
}

/** A drive that stays in flight for a while: the run is running, and the test can act inside it. */
const slowStream =
  (text: string, milliseconds: number): (() => AssistantMessageEventStream) =>
  () => {
    const stream = new AssistantMessageEventStream()
    stream.push({ type: 'start', partial: partialAssistant('', 'pending') })
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: partialAssistant(text, 'pending') })
    setTimeout(() => {
      stream.push({ type: 'done', reason: 'stop', message: partialAssistant(text, 'stop') })
    }, milliseconds)
    return stream
  }
describe('[runtime] a conversation turn, driven by the assembled agent', () => {
  it('announces the user first, streams the answer, and persists both as it goes', async () => {
    const { runtime, events, store, workspace } = openRuntime({ drives: [() => textStream('Hello there.')] })

    await runtime.prompt('fix the parser')
    expect(await runtime.settle()).toBe(true)
    await runtime.close()

    const said = events.find((event) => event.type === 'user_message')
    expect(said?.type === 'user_message' ? said.message.blocks : []).toEqual([{ kind: 'text', text: 'fix the parser' }])
    expect(typesOf(events)).toContain('turn_started')
    expect(typesOf(events)).toContain('assistant_message_started')
    expect(deltasOf(events)).toBe('Hello there.')
    expect(typesOf(events)).toContain('assistant_message_finished')
    expect(typesOf(events).indexOf('assistant_message_finished')).toBeLessThan(typesOf(events).indexOf('turn_finished'))

    expect(textsOf(store, workspace)).toEqual(['fix the parser', 'Hello there.'])
    expect(messageOf(store, workspace, 1).stopReason).toBe('stop')
  })

  it('reports what the run spent, as numbers the window can add up', async () => {
    const { runtime, events } = openRuntime({ drives: [() => textStream('Noted.')] })

    await runtime.prompt('remember this')
    await runtime.settle()
    await runtime.close()

    const usage = events.find((event) => event.type === 'usage_recorded')
    expect(usage?.type === 'usage_recorded' ? usage.usage.totalTokens : 0).toBeGreaterThan(0)
  })

  it('runs a second turn in the same conversation, chained to the first', async () => {
    const { runtime, events, store, workspace } = openRuntime({
      drives: [() => textStream('first'), () => textStream('second')],
    })

    await runtime.prompt('one')
    await runtime.settle()
    await runtime.prompt('two')
    await runtime.settle()
    await runtime.close()

    expect(rowOf(events, 'user_message')).toHaveLength(2)
    expect(rowOf(events, 'turn_finished')).toHaveLength(2)
    const entries = store.entries('c1', workspace)
    expect(entries.entries).toHaveLength(4)
    expect(entries.entries[1]?.parentId).toBe(entries.entries[0]?.id)
  })

  it('says a run failed when the message that ended it says so', async () => {
    const { runtime, events, store, workspace } = openRuntime({
      drives: [() => failingStream('the provider hung up', 'error')],
    })

    await runtime.prompt('hi')
    await runtime.settle()
    await runtime.close()

    const failure = events.find((event) => event.type === 'run_failed')
    expect(failure?.message).toBe('the provider hung up')
    expect(messageOf(store, workspace, 1)).toMatchObject({ stopReason: 'error', errorMessage: 'the provider hung up' })
  })

  it('a runtime with nothing assembled refuses a prompt as a case, and can still be read', async () => {
    const { runtime, events, store, workspace, id } = openRuntime({ unAssembled: true })

    // The case is said to the conversation and answered to the caller, so whoever asked knows the
    // turn never started without having to read the events to find out (#199).
    await expect(runtime.prompt('hi')).resolves.toEqual({ kind: 'no-model' })
    // Which refusal it was, not a sentence: the window is the thing with a language (ADR-0010).
    expect(events.find((event) => event.type === 'turn_refused')).toMatchObject({
      type: 'turn_refused',
      refusal: { kind: 'no-model' },
    })
    expect(events.find((event) => event.type === 'run_failed')).toBeUndefined()
    expect(store.transcript(id, workspace)).toEqual([])
    expect(runtime.isRunning()).toBe(false)
    expect(store.entries('c1', workspace).entries).toEqual([])
  })
})

describe('[runtime] the tools a plugin contributes', () => {
  it('runs a call end to end and keeps its result in the session', async () => {
    const executed: string[] = []
    const { runtime, events, store, workspace } = openRuntime({
      drives: [() => toolUseStream('echo', { text: 'carried' }), () => textStream('All done.')],
      tools: [toolNamed('echo', executed)],
    })

    await runtime.prompt('run echo')
    await runtime.settle()
    await runtime.close()

    expect(executed).toEqual(['echo'])
    expect(events.find((event) => event.type === 'tool_started')).toMatchObject({
      name: 'echo',
      args: { text: 'carried' },
    })
    const finished = events.find((event) => event.type === 'tool_finished')
    // No gate in this ticket: a call just runs, and what it printed is what the row shows.
    expect(finished?.type === 'tool_finished' ? finished.status : '').toBe('ok')
    expect(finished?.type === 'tool_finished' ? finished.output : '').toBe('carried')
    expect(textsOf(store, workspace)).toEqual(['run echo', 'carried', 'All done.'])
    expect(messageOf(store, workspace, 2)).toMatchObject({ role: 'toolResult', toolCallId: 'call-1', isError: false })
  })

  it('no tools means no crash when the model asks for one anyway', async () => {
    const { runtime, events, store, workspace } = openRuntime({
      drives: [() => toolUseStream('ghost', { text: 'boo' }), () => textStream('Understood.')],
    })

    await runtime.prompt('try it')
    await runtime.settle()
    await runtime.close()

    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' ? finished.status : '').toBe('failed')
    expect(textsOf(store, workspace)).toHaveLength(3)
  })
})

describe('[runtime] the session the store owns', () => {
  it('reads the conversation back as the messages that were said, live and reopened', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const store = new SessionStore(mkdtempSync(join(tmpdir(), 'alpha-sessions-')))
    const first = openRuntime({ store, workspace, drives: [() => textStream('Noted.')] })
    await first.runtime.prompt('remember this')
    await first.runtime.settle()
    const live = store.transcript(first.id, workspace)
    await first.runtime.close()

    // Reopening is a new runtime over the same store and the same session, and the read is the
    // store's either way: the session is the record, and a runtime never held one of its own. That
    // the two agree is now a property of there being one read path, so what is left to say here is
    // that what was said is in the file the second runtime starts from.
    const second = openRuntime({ store, workspace, drives: [() => textStream('again')] })
    expect(store.transcript(second.id, workspace)).toEqual(live)
    expect(store.transcript(second.id, workspace).map((message) => message.role)).toEqual(['user', 'assistant'])
    await second.runtime.close()

    expect(textsOf(store, workspace)).toEqual(['remember this', 'Noted.'])
  })

  it('starts the agent with the history the session already holds', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const store = new SessionStore(mkdtempSync(join(tmpdir(), 'alpha-sessions-')))
    const first = openRuntime({ store, workspace, drives: [() => textStream('Noted.')] })
    await first.runtime.prompt('remember this')
    await first.runtime.settle()
    await first.runtime.close()

    const second = openRuntime({ store, workspace, drives: [() => textStream('I did.')] })
    expect(second.agent?.state.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant'])
    await second.runtime.prompt('do you remember?')
    await second.runtime.settle()
    await second.runtime.close()

    expect(textsOf(store, workspace)).toEqual(['remember this', 'Noted.', 'do you remember?', 'I did.'])
  })

  it('a compaction in the session collapses the history before it', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const store = new SessionStore(mkdtempSync(join(tmpdir(), 'alpha-sessions-')))
    store.append({
      sessionId: 'c1',
      workspacePath: workspace,
      entry: { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'earlier' }], timestamp: 1 } },
    })
    store.compact({ sessionId: 'c1', workspacePath: workspace, summary: 'Everything before was about naming.' })

    const { agent } = openRuntime({ store, workspace })
    expect(agent?.state.messages.map((message) => message.role)).toEqual(['system', 'user'])
    expect(JSON.stringify(agent?.state.messages[1])).toContain('Everything before was about naming.')
  })
})

describe('[runtime] steering a running turn', () => {
  it('a steer arrives in the run, and the run takes it', async () => {
    const { runtime, events, agent } = openRuntime({
      drives: [slowStream('working...', 200), () => textStream('ok, steered')],
    })

    await runtime.prompt('start')
    await waitedFor(events, 'assistant_message_started')
    await runtime.steer('actually, this instead')
    await runtime.settle()
    await runtime.close()

    // The agent consumed it: the run took a second drive and the steer is in its transcript.
    // pi's turns are model calls, Alpha's is the whole run, so it is still one turn that ended.
    expect(agent?.state.messages.some((message) => JSON.stringify(message).includes('actually, this instead'))).toBe(
      true,
    )
    expect(rowOf(events, 'turn_finished')).toHaveLength(1)
  })

  it('replaceSteers empties what the agent is holding', async () => {
    const { runtime, agent } = openRuntime({})

    await runtime.steer('one')
    expect(agent?.hasQueuedMessages()).toBe(true)
    runtime.replaceSteers([])
    expect(agent?.hasQueuedMessages()).toBe(false)
  })
})

describe('[runtime] stopping a run', () => {
  it('records the final workspace state after Stop', async () => {
    const changes = new WorkspaceChangeLog(mkdtempSync(join(tmpdir(), 'alpha-changes-')))
    const { runtime, events, workspace } = openRuntime({
      changes,
      drives: [slowStream('unfinished', 200)],
    })

    await runtime.prompt('change a file')
    await waitedFor(events, 'assistant_message_started')
    writeFileSync(join(workspace, 'stopped.txt'), 'written before Stop')
    await runtime.abort()
    await runtime.settle()

    expect(events.filter((event) => event.type === 'workspace_changes_recorded')).toMatchObject([
      { changeSet: { files: [{ path: 'stopped.txt', kind: 'added', afterText: 'written before Stop' }] } },
    ])
    await runtime.close()
  })

  it('abort ends the turn with the message marked interrupted, persisted as aborted', async () => {
    let stream: Undef<AssistantMessageEventStream>
    const { runtime, events, store, workspace } = openRuntime({
      drives: [
        () => {
          stream = new AssistantMessageEventStream()
          stream.push({ type: 'start', partial: partialAssistant('', 'pending') })
          return stream
        },
      ],
    })

    await runtime.prompt('a long answer')
    await waitedFor(events, 'assistant_message_started')
    await runtime.abort()
    stream?.push({ type: 'error', reason: 'aborted', error: partialAssistant('the part that arrived', 'aborted') })
    expect(await runtime.settle()).toBe(false)
    await runtime.close()

    expect(typesOf(events)).toContain('turn_finished')
    expect(typesOf(events)).not.toContain('run_failed')
    expect(messageOf(store, workspace, 1).stopReason).toBe('aborted')
    expect(runtime.isRunning()).toBe(false)
  })

  it('an abort is never a reason to retry, even with a retry policy on the path', async () => {
    let stream: Undef<AssistantMessageEventStream>
    const { runtime, events } = openRuntime({
      retry: createRetryPlugin({ delays: [0, 0] }),
      drives: [
        () => {
          stream = new AssistantMessageEventStream()
          stream.push({ type: 'start', partial: partialAssistant('', 'pending') })
          return stream
        },
      ],
    })

    await runtime.prompt('a long answer')
    await waitedFor(events, 'assistant_message_started')
    await runtime.abort()
    stream?.push({ type: 'error', reason: 'aborted', error: partialAssistant('cut off', 'aborted') })
    await runtime.settle()
    await runtime.close()

    expect(typesOf(events)).toContain('turn_finished')
    // A second drive would have found the script dry and failed the run all over again.
    expect(typesOf(events)).not.toContain('run_failed')
  })

  it('Stop during retry backoff prevents another model request and ends the turn', async () => {
    const retry = createRetryPlugin({ delays: [300] })
    const originalAfterRun = retry.afterRun
    let backoffBegan!: () => void
    const inBackoff = new Promise<void>((resolve) => {
      backoffBegan = resolve
    })
    retry.afterRun = async (outcome, signal) => {
      backoffBegan()
      return originalAfterRun(outcome, signal)
    }
    let drives = 0
    const { runtime, events } = openRuntime({
      retry,
      drives: [
        () => {
          drives += 1
          return failingStream('503 temporary provider failure', 'error')
        },
        () => {
          drives += 1
          return textStream('should not be requested')
        },
      ],
    })

    await runtime.prompt('try once')
    await inBackoff
    await runtime.abort()
    expect(await runtime.settle()).toBe(false)
    expect(drives).toBe(1)
    expect(typesOf(events)).toContain('turn_finished')
    expect(runtime.isRunning()).toBe(false)
    await runtime.close()
  })

  it('closing a conversation ends its running bash process', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const tools = createWorkspaceToolsPlugin({ workspacePath: workspace }).tools()
    const { runtime, events } = openRuntime({
      workspace,
      tools,
      drives: [
        () =>
          toolUseStream('bash', {
            command: 'node -e "console.log(\'started\'); setTimeout(() => {}, 3000)"',
          }),
      ],
    })

    await runtime.prompt('run a command')
    for (
      let attempt = 0;
      attempt < 300 && !events.some((event) => event.type === 'tool_output' && event.output.includes('started'));
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(events.some((event) => event.type === 'tool_output' && event.output.includes('started'))).toBe(true)
    const closingAt = Date.now()
    await runtime.close()

    expect(Date.now() - closingAt).toBeLessThan(1500)
    expect(runtime.isRunning()).toBe(false)
    expect(typesOf(events)).toContain('turn_finished')
    expect(typesOf(events)).not.toContain('run_failed')
  })
})

describe('[runtime] workspace review failures', () => {
  it.each(['begin', 'finish'] as const)('does not prevent an agent turn when %s throws', async (phase) => {
    const changes = new WorkspaceChangeLog(mkdtempSync(join(tmpdir(), 'alpha-changes-')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(changes, phase).mockImplementation(() => {
      throw new Error('review failed')
    })
    const { runtime, events } = openRuntime({ changes, drives: [() => textStream('Answer.')] })

    await expect(runtime.prompt('hello')).resolves.toBeUndefined()
    await expect(runtime.settle()).resolves.toBe(true)
    expect(typesOf(events)).toContain('turn_finished')
    expect(runtime.isRunning()).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    await runtime.close()
    warn.mockRestore()
  })
})

describe('[runtime] consecutive workspace reviews', () => {
  it('does not let concurrent prompts overwrite the first run baseline', async () => {
    const changes = new WorkspaceChangeLog(mkdtempSync(join(tmpdir(), 'alpha-changes-')))
    const { runtime, events, workspace } = openRuntime({
      changes,
      drives: [slowStream('first', 100), slowStream('second', 100)],
    })

    await runtime.prompt('first')
    await waitedFor(events, 'turn_started')
    const second = runtime.prompt('second')
    writeFileSync(join(workspace, 'first.txt'), 'first run')
    await waitedFor(events, 'workspace_changes_recorded')
    await second
    for (let attempt = 0; attempt < 100 && rowOf(events, 'turn_started').length < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    writeFileSync(join(workspace, 'second.txt'), 'second run')
    await runtime.settle()

    const reviews = events.filter((event) => event.type === 'workspace_changes_recorded')
    expect(reviews.map((event) => event.changeSet.files)).toMatchObject([
      [{ path: 'first.txt', kind: 'added' }],
      [{ path: 'second.txt', kind: 'added' }],
    ])
    await runtime.close()
  })
})

describe('[runtime] a transient failure the retry policy takes', () => {
  it('a post-run failure replaces a pending success with one failure', async () => {
    const retry = createRetryPlugin({ delays: [0] })
    retry.afterRun = async () => {
      throw new Error('post-run failed')
    }
    const { runtime, events } = openRuntime({ retry, drives: [() => textStream('answer')] })

    await runtime.prompt('work')
    expect(await runtime.settle()).toBe(false)
    expect(rowOf(events, 'turn_finished')).toHaveLength(0)
    expect(rowOf(events, 'run_failed')).toEqual([
      { conversationId: 'c1', type: 'run_failed', message: 'post-run failed' },
    ])
    expect(events.reduce(reduceTranscript, emptyTranscript('c1')).status).toBe('failed')
    await runtime.close()
  })

  it('retries inside the same turn: one turn in the window, the recovery in the store', async () => {
    const { runtime, events, store, workspace, agent } = openRuntime({
      retry: createRetryPlugin({ delays: [0, 0] }),
      drives: [() => partialFailure('discarded draft', '503 transient boom'), () => textStream('recovered')],
    })

    await runtime.prompt('fix the parser')
    expect(await runtime.settle()).toBe(true)
    await runtime.close()

    // The turn stayed open across the retry: started once, finished once, never failed.
    expect(rowOf(events, 'turn_started')).toHaveLength(1)
    expect(rowOf(events, 'turn_finished')).toHaveLength(1)
    expect(typesOf(events)).not.toContain('run_failed')
    const last = tipPath(store.entries('c1', workspace).entries, store.entries('c1', workspace).leafId).at(-1)
    expect(last?.message).toMatchObject({ role: 'assistant', stopReason: 'stop' })
    expect(JSON.stringify(last?.message)).toContain('recovered')
    // The base dropped the failed turn, so the live context carries only what came before it.
    expect(JSON.stringify(agent?.state.messages)).not.toContain('transient boom')
    expect(JSON.stringify(agent?.state.messages)).not.toContain('discarded draft')
    expect(JSON.stringify(agent?.state.messages)).toContain('recovered')
    const read = store.entries('c1', workspace)
    expect(
      read.entries.some((entry) => entry.message?.role === 'assistant' && entry.message.stopReason === 'error'),
    ).toBe(true)
    expect(tipPath(read.entries, read.leafId).map((entry) => entry.type)).toEqual(['message', 'retry', 'message'])
    expect(JSON.stringify(tipPath(read.entries, read.leafId))).not.toContain('transient boom')
    const projected = events.reduce(reduceTranscript, emptyTranscript('c1'))
    expect(JSON.stringify(projected.messages)).not.toContain('discarded draft')
    expect(
      events
        .filter((event) => event.type === 'usage_recorded')
        .reduce((sum, event) => sum + event.usage.totalTokens, 0),
    ).toBe(4)
    expect(totalUsage(projected).totalTokens).toBe(4)
    expect(store.usage('c1', workspace).totalTokens).toBe(4)
    const reopened = openRuntime({ store, workspace })
    expect(JSON.stringify(reopened.agent?.state.messages)).not.toContain('transient boom')
    expect(JSON.stringify(reopened.agent?.state.messages)).toContain('recovered')
    await reopened.runtime.close()
  })

  it('the retry cap ends the run as the failure the window reads', async () => {
    const { runtime, events, store, workspace } = openRuntime({
      retry: createRetryPlugin({ delays: [0] }),
      drives: [() => failingStream('503 boom one', 'error'), () => failingStream('503 boom two', 'error')],
    })

    await runtime.prompt('fix the parser')
    expect(await runtime.settle()).toBe(false)
    await runtime.close()

    expect(rowOf(events, 'turn_started')).toHaveLength(1)
    expect(rowOf(events, 'run_failed')).toEqual([{ conversationId: 'c1', type: 'run_failed', message: '503 boom two' }])
    expect(typesOf(events)).not.toContain('turn_finished')
    const read = store.entries('c1', workspace)
    const path = tipPath(read.entries, read.leafId)
    expect(JSON.stringify(path)).not.toContain('boom one')
    expect(path.at(-1)?.message).toMatchObject({ role: 'assistant', stopReason: 'error', errorMessage: '503 boom two' })
    expect(store.usage('c1', workspace).totalTokens).toBe(4)
    const reopened = openRuntime({ store, workspace })
    expect(JSON.stringify(reopened.agent?.state.messages)).not.toContain('boom one')
    expect(JSON.stringify(reopened.agent?.state.messages)).toContain('boom two')
    await reopened.runtime.close()
  })
})

describe('[runtime] moving the branch tip', () => {
  it('forkAt adopts the copy, and the next turn is written into it', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
    const sessionsRoot = mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
    const store = new SessionStore(sessionsRoot)
    const first = openRuntime({ store, workspace, drives: [() => textStream('The first answer.')] })
    await first.runtime.prompt('a question')
    await first.runtime.settle()
    await first.runtime.close()

    const second = openRuntime({ store, workspace, drives: [() => textStream('The second answer.')] })
    const lastUser = store.userEntries(second.id, workspace).at(-1)
    const forked = await second.runtime.forkAt(lastUser?.id ?? '')
    expect(forked).toBeDefined()
    expect(forked).not.toBe('c1')

    // The store now holds two files: the original untouched, the copy where the conversation is.
    expect(readdirSync(sessionDirectoryFor(sessionsRoot, workspace))).toHaveLength(2)
    await second.runtime.prompt('a better question')
    await second.runtime.settle()
    await second.runtime.close()

    expect(textsOf(store, workspace, 'c1')).toEqual(['a question', 'The first answer.'])
    expect(textsOf(store, workspace, forked ?? '')).toEqual(['a better question', 'The second answer.'])
  })
})

describe('[runtime] what a conversation runs on', () => {
  it('setModel swaps the model the agent state names, and setThinkingLevel carries Alpha’s levels', () => {
    const { runtime, agent } = openRuntime({})

    void runtime.setModel('p', 'm')
    expect(agent?.state.model.id).toBe('m')

    void runtime.setThinkingLevel('high')
    expect(agent?.state.thinkingLevel).toBe('high')
    // Alpha's 'off' is pi's 'off': the agent reads it as no reasoning at all, so it crosses as it is.
    void runtime.setThinkingLevel('off')
    expect(agent?.state.thinkingLevel).toBe('off')
  })

  it('names the model it could not switch to, as a case', () => {
    const { runtime, agent, events } = openRuntime({})

    void runtime.setModel('p', 'ghost')

    // The model the agent was on is untouched, and the window is told which refusal this was: the
    // sentence for it, in the window's language, is the dictionary's (ADR-0010).
    expect(agent?.state.model.id).toBe('m')
    expect(events.at(-1)).toMatchObject({
      type: 'turn_refused',
      refusal: { kind: 'model-not-served', providerId: 'p', modelId: 'ghost' },
    })
  })
})
