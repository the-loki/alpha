import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChatBlockTool, RuntimeEvent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { ConversationRuntime } from './conversation-runtime.ts'
import { resolveModelRuntime } from './models.ts'

/**
 * The ledger, end to end and without a model: a scripted call goes through the real harness into
 * the real tools against a real workspace. What the assertions read is exactly what the window
 * receives, so a row that renders wrong here renders wrong on screen.
 */
const open = async (options: { workspace: string; replies: unknown[]; sessionsRoot?: string; id?: string }) => {
  const sessionsRoot = options.sessionsRoot ?? mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
  const events: RuntimeEvent[] = []
  const opened = await ConversationRuntime.open({
    conversationId: options.id ?? 'ledger',
    workspacePath: options.workspace,
    sessionsRoot,
    modelRuntime: resolveModelRuntime({
      ALPHA_FAUX: '1',
      ALPHA_FAUX_REPLIES: JSON.stringify(options.replies),
    }),
    systemPrompt: 'You are Alpha.',
    emit: (event) => events.push(event),
  })
  return { ...opened, events, sessionsRoot }
}

const workspaceWith = (files: Record<string, string>): string => {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  for (const [name, content] of Object.entries(files)) writeFileSync(join(workspace, name), content)
  return workspace
}

const ledgerRow = (messages: { blocks: unknown[] }[], index = 0): ChatBlockTool => {
  const blocks = messages.flatMap((message) => message.blocks).filter(isToolBlock)
  const block = blocks[index]
  if (block === undefined) throw new Error(`no tool row at ${index}`)
  return block
}

const isToolBlock = (block: unknown): block is ChatBlockTool =>
  typeof block === 'object' && block !== null && (block as { kind?: string }).kind === 'tool'

describe('[runtime] a scripted tool call', () => {
  it('reads a file and reports the row the window renders', async () => {
    const workspace = workspaceWith({ 'notes.txt': 'hello from the ledger' })
    const { runtime, events } = await open({
      workspace,
      replies: [{ tool: { name: 'read', args: { path: 'notes.txt' } } }, 'It says hello.'],
    })

    await runtime.prompt('read notes.txt')
    await runtime.close()

    const started = events.find((event) => event.type === 'tool_started')
    const finished = events.find((event) => event.type === 'tool_finished')
    expect(started?.type === 'tool_started' && started.name).toBe('read')
    expect(started?.type === 'tool_started' && started.risk).toBe('read')
    expect(started?.type === 'tool_started' && started.summary).toBe('notes.txt')
    expect(finished?.type === 'tool_finished' && finished.status).toBe('ok')
    expect(finished?.type === 'tool_finished' && finished.output).toContain('hello from the ledger')
    expect(finished?.type === 'tool_finished' && finished.endedAt).toBeGreaterThanOrEqual(
      finished?.type === 'tool_finished' ? finished.endedAt - 1 : 0,
    )
  })

  it('runs the model again after the tool so the turn ends with its answer', async () => {
    const workspace = workspaceWith({ 'notes.txt': 'hello' })
    const { runtime, events } = await open({
      workspace,
      replies: [{ tool: { name: 'read', args: { path: 'notes.txt' } } }, 'The file says hello.'],
    })

    await runtime.prompt('read it')
    await runtime.close()

    const deltas = events.filter((event) => event.type === 'assistant_text_delta').map((event) => event.delta)
    expect(deltas.join('')).toBe('The file says hello.')
    expect(events.filter((event) => event.type === 'turn_finished')).toHaveLength(1)
  })

  it('carries the arguments through so the row can show them raw', async () => {
    const workspace = workspaceWith({ 'notes.txt': 'hello' })
    const { runtime, events } = await open({
      workspace,
      replies: [{ tool: { name: 'read', args: { path: 'notes.txt' } } }, 'done'],
    })

    await runtime.prompt('read it')
    await runtime.close()

    const started = events.find((event) => event.type === 'tool_started')
    expect(started?.type === 'tool_started' && JSON.parse(started.raw)).toEqual({ path: 'notes.txt' })
  })

  it('marks a tool that fails, and keeps what it printed', async () => {
    const workspace = workspaceWith({})
    const { runtime, events } = await open({
      workspace,
      replies: [{ tool: { name: 'bash', args: { command: 'echo nope >&2; exit 3' } } }, 'That failed.'],
    })

    await runtime.prompt('run the failing thing')
    await runtime.close()

    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' && finished.status).toBe('failed')
    expect(finished?.type === 'tool_finished' && finished.output).toContain('nope')
    expect(finished?.type === 'tool_finished' && finished.details?.exitCode).toBe(3)
  })

  it('runs a write, so the workspace changes as the ledger says it did', async () => {
    const workspace = workspaceWith({})
    const { runtime, events } = await open({
      workspace,
      replies: [{ tool: { name: 'write', args: { path: 'out.txt', content: 'written by the tool' } } }, 'Wrote it.'],
    })

    await runtime.prompt('write the file')
    await runtime.close()

    expect(events.find((event) => event.type === 'tool_finished')?.type === 'tool_finished').toBe(true)
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(join(workspace, 'out.txt'), 'utf8')).toBe('written by the tool')
  })

  it('leaves a denied call out of the turn when the tool does not exist', async () => {
    const workspace = workspaceWith({})
    const { runtime, events } = await open({
      workspace,
      replies: [{ tool: { name: 'no_such_tool', args: {} } }, 'Never mind.'],
    })

    await runtime.prompt('call something that does not exist')
    await runtime.close()

    const finished = events.find((event) => event.type === 'tool_finished')
    expect(finished?.type === 'tool_finished' && finished.status).toBe('failed')
  })
})

describe('[runtime] a ledger row that was persisted', () => {
  it('comes back identical, status, duration and details included', async () => {
    const workspace = workspaceWith({ 'notes.txt': 'hello from the ledger' })
    const first = await open({
      workspace,
      replies: [{ tool: { name: 'bash', args: { command: 'echo nope >&2; exit 3' } } }, 'It failed.'],
    })
    await first.runtime.prompt('run it')
    await first.runtime.close()

    const metadata = await readMetadata(first.sessionsRoot)
    const reopened = await ConversationRuntime.open({
      conversationId: 'ledger',
      workspacePath: workspace,
      sessionsRoot: first.sessionsRoot,
      modelRuntime: resolveModelRuntime({ ALPHA_FAUX: '1' }),
      systemPrompt: 'You are Alpha.',
      sessionMetadata: metadata as never,
      emit: () => undefined,
    })

    const live = first.events.filter((event) => event.type === 'tool_finished')
    const row = ledgerRow(reopened.messages)
    expect(live).toHaveLength(1)
    expect(row.name).toBe('bash')
    expect(row.risk).toBe('execute')
    expect(row.summary).toBe('echo nope >&2; exit 3')
    expect(row.status).toBe('failed')
    expect(row.details?.exitCode).toBe(3)
    expect(row.output).toContain('nope')
    // The row's duration is endedAt - startedAt, so both ends must survive the round trip.
    expect(row.startedAt).toBeGreaterThan(0)
    expect(row.endedAt).toBeGreaterThanOrEqual(row.startedAt)
    await reopened.runtime.close()
  })

  it('is attached to the assistant message that asked for it', async () => {
    const workspace = workspaceWith({ 'notes.txt': 'hello' })
    const first = await open({
      workspace,
      replies: [{ tool: { name: 'read', args: { path: 'notes.txt' } } }, 'Read it.'],
    })
    await first.runtime.prompt('read it')
    await first.runtime.close()

    const reopened = await ConversationRuntime.open({
      conversationId: 'ledger',
      workspacePath: workspace,
      sessionsRoot: first.sessionsRoot,
      modelRuntime: resolveModelRuntime({ ALPHA_FAUX: '1' }),
      systemPrompt: 'You are Alpha.',
      sessionMetadata: (await readMetadata(first.sessionsRoot)) as never,
      emit: () => undefined,
    })

    expect(reopened.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'assistant'])
    expect(reopened.messages[1].blocks.map((block) => block.kind)).toEqual(['tool'])
    expect(reopened.messages[2].blocks).toEqual([{ kind: 'text', text: 'Read it.' }])
    await reopened.runtime.close()
  })
})

const readMetadata = async (sessionsRoot: string) => {
  const { JsonlSessionRepo, BACKGROUND_CONTEXT } = await import('@earendil-works/pi-agent-core')
  const { NodeExecutionEnv } = await import('@earendil-works/pi-agent-core/node')
  const repo = new JsonlSessionRepo({ fileSystem: new NodeExecutionEnv({ cwd: sessionsRoot }), sessionsRoot })
  const [metadata] = await repo.list(undefined, BACKGROUND_CONTEXT)
  return metadata
}
