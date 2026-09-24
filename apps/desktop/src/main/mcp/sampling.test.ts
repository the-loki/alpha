import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeEvent } from '@alpha/domain'
import { McpRequestError, type McpServerRequest } from '@alpha/mcp'
import { McpExchangeLog } from '@alpha/sessions'
import { describe, expect, it } from 'vitest'
import { McpSamplingBroker, type SamplingModel } from './sampling.ts'

const params = {
  messages: [{ role: 'user', content: { type: 'text', text: 'Original question' } }],
  maxTokens: 200,
  includeContext: 'allServers',
}
const usage = { input: 11, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 16, cost: 0 }

function harness(options: { model?: SamplingModel; modelAvailable?: boolean; unattended?: boolean } = {}) {
  const events: RuntimeEvent[] = []
  const log = new McpExchangeLog(mkdtempSync(join(tmpdir(), 'alpha-mcp-sampling-')))
  const generated: Array<{ prompt: string; maxTokens: number; aborted: boolean }> = []
  const model: SamplingModel = options.model ?? {
    providerId: 'p',
    modelId: 'm',
    name: 'Model M',
    maxTokens: 128,
    generate: async (prompt, signal) => {
      generated.push({ prompt: prompt.messages[0]?.text ?? '', maxTokens: prompt.maxTokens, aborted: signal.aborted })
      return { text: 'Generated answer', usage, stopReason: 'stop' }
    },
  }
  const broker = new McpSamplingBroker({
    log,
    emit: (event) => events.push(event),
    refuseUnattended: () => options.unattended === true,
    modelFor: () => (options.modelAvailable === false ? undefined : model),
  })
  const stop = new AbortController()
  const request: McpServerRequest = {
    server: 'files',
    method: 'sampling/createMessage',
    params,
    context: { conversationId: 'first', toolCallId: 'call-1', toolName: 'mcp__files__query' },
    signal: stop.signal,
  }
  return { broker, events, log, generated, request, stop }
}

describe('[main] MCP sampling', () => {
  it('requires consent, uses only edited explicit text, and shares only after review', async () => {
    const { broker, events, log, generated, request } = harness()
    const result = broker.handle(request)
    const pending = broker.pending('first')[0]
    expect(pending).toMatchObject({ stage: 'consent', prompt: { requestedContext: true }, model: { maxTokens: 128 } })
    expect(generated).toEqual([])
    await expect(
      broker.answer('second', pending?.requestId ?? '', { action: 'generate', messages: ['Edited'] }),
    ).rejects.toThrow()
    await broker.answer('first', pending?.requestId ?? '', { action: 'generate', messages: ['Edited'] })
    expect(generated).toEqual([{ prompt: 'Edited', maxTokens: 128, aborted: false }])
    expect(broker.pending('first')[0]).toMatchObject({ stage: 'review', generated: { text: 'Generated answer' } })
    expect(log.list('first')[0]).toMatchObject({
      outcome: 'pending',
      submittedText: 'Edited',
      usage: { totalTokens: 16 },
    })
    await broker.answer('first', pending?.requestId ?? '', { action: 'share' })
    await expect(result).resolves.toEqual({
      role: 'assistant',
      content: { type: 'text', text: 'Generated answer' },
      model: 'm',
      stopReason: 'endTurn',
    })
    expect(log.list('first')[0]).toMatchObject({ outcome: 'accepted', responseText: 'Generated answer' })
    expect(events.filter((event) => event.type === 'mcp_sampling_requested')).toHaveLength(3)
  })

  it('keeps generation usage after decline and never shares it', async () => {
    const { broker, request, log } = harness()
    const result = broker.handle(request)
    const id = broker.pending('first')[0]?.requestId ?? ''
    await broker.answer('first', id, { action: 'generate', messages: ['Edited'] })
    await broker.answer('first', id, { action: 'decline' })
    await expect(result).rejects.toBeInstanceOf(McpRequestError)
    expect(log.list('first')[0]).toMatchObject({ outcome: 'declined', usage: { totalTokens: 16 } })
    expect(log.list('first')[0]?.responseText).toBeUndefined()
  })

  it('keeps usage even when generated text cannot be reviewed', async () => {
    const { broker, request, log } = harness({
      model: {
        providerId: 'p',
        modelId: 'm',
        name: 'Model M',
        maxTokens: 128,
        generate: async () => ({ text: '', usage, stopReason: 'stop' }),
      },
    })
    const result = broker.handle(request)
    const id = broker.pending('first')[0]?.requestId ?? ''
    await expect(broker.answer('first', id, { action: 'generate', messages: ['Edited'] })).rejects.toThrow(
      'Model returned no supported text',
    )
    await expect(result).rejects.toBeInstanceOf(McpRequestError)
    expect(log.list('first')[0]).toMatchObject({ outcome: 'refused', usage: { totalTokens: 16 } })
  })

  it('aborts a running generation and never shares a late model answer', async () => {
    let finish: ((value: { text: string; usage: typeof usage; stopReason: 'stop' }) => void) | undefined
    let signal: AbortSignal | undefined
    const { broker, request, log } = harness({
      model: {
        providerId: 'p',
        modelId: 'm',
        name: 'Model M',
        maxTokens: 128,
        generate: async (_prompt, received) => {
          signal = received
          return await new Promise((resolve) => {
            finish = resolve
          })
        },
      },
    })
    const result = broker.handle(request)
    const id = broker.pending('first')[0]?.requestId ?? ''
    const generation = broker.answer('first', id, { action: 'generate', messages: ['Edited'] })
    expect(broker.pending('first')[0]?.stage).toBe('generating')
    await broker.answer('first', id, { action: 'cancel' })
    expect(signal?.aborted).toBe(true)
    finish?.({ text: 'Too late', usage, stopReason: 'stop' })
    await generation
    await expect(result).rejects.toBeInstanceOf(McpRequestError)
    expect(log.list('first')[0]).toMatchObject({ outcome: 'cancelled' })
    expect(log.list('first')[0]?.responseText).toBeUndefined()
  })

  it('refuses an unattended or model-less request before a model call', async () => {
    for (const options of [{ unattended: true }, { modelAvailable: false }]) {
      const { broker, request, log } = harness(options)
      await expect(broker.handle(request)).rejects.toBeInstanceOf(McpRequestError)
      expect(log.list('first')[0]?.outcome).toBe('refused')
      expect(broker.pending('first')).toEqual([])
    }
  })

  it('cancels a pending request when its parent stops', async () => {
    const { broker, request, stop, log } = harness()
    const result = broker.handle(request)
    stop.abort()
    await expect(result).rejects.toBeInstanceOf(McpRequestError)
    expect(broker.pending('first')).toEqual([])
    expect(log.list('first')[0]?.outcome).toBe('cancelled')
  })
})
