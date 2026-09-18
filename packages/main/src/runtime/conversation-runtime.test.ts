import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeEvent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { ConversationRuntime } from './conversation-runtime.ts'
import { resolveModelRuntime } from './models.ts'

/**
 * The runtime seam: a real harness, a real JSONL session on disk, and a scripted model. Nothing
 * downstream of the model is faked, so a green test means the wiring works — not that a mock
 * agrees with itself.
 */
const openRuntime = async (options: { id?: string; replies?: string[]; reopen?: unknown[] } = {}) => {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
  const modelRuntime = resolveModelRuntime({
    ALPHA_FAUX: '1',
    ALPHA_FAUX_REPLIES: JSON.stringify(options.replies ?? ['Scripted reply.']),
  })
  const events: RuntimeEvent[] = []
  const id = options.id ?? 'c1'
  const opened = await ConversationRuntime.open({
    conversationId: id,
    workspacePath: workspace,
    sessionsRoot,
    modelRuntime,
    systemPrompt: 'You are Alpha.',
    emit: (event) => events.push(event),
  })
  if (options.reopen !== undefined) {
    // Reopening is naming the conversation: the session it is stored in is found by the reader.
    const conversationId = opened.conversationId
    await opened.runtime.close()
    return {
      ...(await ConversationRuntime.open({
        conversationId,
        workspacePath: workspace,
        sessionsRoot,
        modelRuntime,
        systemPrompt: 'You are Alpha.',
        emit: (event) => events.push(event),
      })),
      events,
      sessionsRoot,
      workspace,
    }
  }
  return { ...opened, events, sessionsRoot, workspace }
}

const typesOf = (events: RuntimeEvent[]) => events.map((event) => event.type)

const deltasOf = (events: RuntimeEvent[]) =>
  events
    .filter((event) => event.type === 'assistant_text_delta')
    .map((event) => event.delta)
    .join('')

describe('[runtime] a conversation turn', () => {
  it('reports the user message, the assistant message, and the end of the turn', async () => {
    const { runtime, events } = await openRuntime({ replies: ['Hello there.'] })

    await runtime.prompt('hi')
    await runtime.close()

    expect(typesOf(events)).toContain('user_message')
    expect(typesOf(events)).toContain('assistant_message_started')
    expect(typesOf(events)).toContain('assistant_message_finished')
    expect(typesOf(events)).toContain('turn_finished')
  })

  it('streams the scripted reply as text deltas that add up to the reply', async () => {
    const { runtime, events } = await openRuntime({ replies: ['Hello there.'] })

    await runtime.prompt('hi')
    await runtime.close()

    expect(deltasOf(events)).toBe('Hello there.')
  })

  it('carries the user message through as written', async () => {
    const { runtime, events } = await openRuntime()

    await runtime.prompt('fix the parser')
    await runtime.close()

    const userMessage = events.find((event) => event.type === 'user_message')
    expect(userMessage?.message.blocks).toEqual([{ kind: 'text', text: 'fix the parser' }])
  })

  it('finishes the assistant message before the turn ends', async () => {
    const { runtime, events } = await openRuntime()

    await runtime.prompt('hi')
    await runtime.close()

    expect(typesOf(events).indexOf('assistant_message_finished')).toBeLessThan(typesOf(events).indexOf('turn_finished'))
  })

  it('runs a second turn in the same conversation', async () => {
    const { runtime, events } = await openRuntime({ replies: ['first', 'second'] })

    await runtime.prompt('one')
    await runtime.prompt('two')
    await runtime.close()

    const userMessages = events.filter((event) => event.type === 'user_message')
    expect(userMessages).toHaveLength(2)
    expect(typesOf(events).filter((type) => type === 'turn_finished')).toHaveLength(2)
  })
})

describe('[runtime] the transcript on disk', () => {
  it('is empty for a conversation that has not been used', async () => {
    const { runtime, messages } = await openRuntime()
    expect(messages).toEqual([])
    await runtime.close()
  })

  it('reports the turns that already happened when the conversation is reopened', async () => {
    const first = await openRuntime({ replies: ['Noted.'] })
    await first.runtime.prompt('remember this')
    const conversationId = first.conversationId
    await first.runtime.close()

    const reopened = await ConversationRuntime.open({
      conversationId,
      workspacePath: first.workspace,
      sessionsRoot: first.sessionsRoot,
      modelRuntime: resolveModelRuntime({ ALPHA_FAUX: '1' }),
      systemPrompt: 'You are Alpha.',
      emit: () => undefined,
    })

    expect(reopened.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(reopened.messages[0].blocks).toEqual([{ kind: 'text', text: 'remember this' }])
    expect(reopened.messages[1].blocks).toEqual([{ kind: 'text', text: 'Noted.' }])
    await reopened.runtime.close()
  })
})
