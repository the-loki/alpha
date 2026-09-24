import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeEvent } from '@alpha/domain'
import { McpRequestError, type McpServerRequest } from '@alpha/mcp'
import { McpExchangeLog } from '@alpha/sessions'
import { describe, expect, it } from 'vitest'
import { McpElicitationBroker } from './elicitation.ts'

const params = {
  message: 'Your name?',
  requestedSchema: {
    type: 'object',
    properties: { name: { type: 'string', minLength: 2 } },
    required: ['name'],
  },
}

function harness(refuseUnattended: (id: string) => boolean = () => false) {
  const events: RuntimeEvent[] = []
  const log = new McpExchangeLog(mkdtempSync(join(tmpdir(), 'alpha-mcp-form-')))
  const broker = new McpElicitationBroker({ log, emit: (event) => events.push(event), refuseUnattended })
  const stop = new AbortController()
  const request: McpServerRequest = {
    server: 'files',
    method: 'elicitation/create',
    params,
    context: { conversationId: 'first', toolCallId: 'call-1', toolName: 'mcp__files__lookup' },
    signal: stop.signal,
  }
  return { broker, events, log, request, stop }
}

describe('[main] MCP elicitation', () => {
  it('waits for a validated answer from its own conversation and records what was shared', async () => {
    const { broker, events, log, request } = harness()
    const result = broker.handle(request)
    const [pending] = broker.pending('first')
    expect(pending).toMatchObject({ server: 'files', toolName: 'mcp__files__lookup', form: { message: 'Your name?' } })
    expect(events[0]).toMatchObject({ conversationId: 'first', type: 'mcp_elicitation_requested' })
    expect(() =>
      broker.answer('second', pending?.requestId ?? '', { action: 'accept', content: { name: 'Ada' } }),
    ).toThrow()
    expect(() =>
      broker.answer('first', pending?.requestId ?? '', { action: 'accept', content: { name: 'A' } }),
    ).toThrow()
    expect(broker.pending('first')).toHaveLength(1)

    broker.answer('first', pending?.requestId ?? '', { action: 'accept', content: { name: 'Ada' } })
    await expect(result).resolves.toEqual({ action: 'accept', content: { name: 'Ada' } })
    expect(broker.pending('first')).toEqual([])
    expect(log.list('first')[0]).toMatchObject({ outcome: 'accepted', content: { name: 'Ada' } })
    expect(events.at(-1)).toMatchObject({ conversationId: 'first', type: 'mcp_exchange_recorded' })
  })

  it('distinguishes decline, cancellation and a run with nobody watching', async () => {
    const { broker, request, stop, log } = harness((id) => id === 'unattended')
    const declined = broker.handle(request)
    broker.answer('first', broker.pending('first')[0]?.requestId ?? '', { action: 'decline' })
    await expect(declined).resolves.toEqual({ action: 'decline' })

    const cancelled = broker.handle(request)
    stop.abort()
    await expect(cancelled).resolves.toEqual({ action: 'cancel' })
    expect(log.list('first')[0]?.outcome).toBe('cancelled')
    expect(broker.pending('first')).toEqual([])

    const unattended = {
      ...request,
      context: { ...request.context, conversationId: 'unattended' },
      signal: new AbortController().signal,
    }
    await expect(broker.handle(unattended)).rejects.toBeInstanceOf(McpRequestError)
    expect(log.list('unattended')[0]?.outcome).toBe('refused')
    expect(broker.pending('unattended')).toEqual([])
  })

  it('audits a server form whose schema cannot be shown', async () => {
    const { broker, request, log, events } = harness()
    await expect(
      broker.handle({
        ...request,
        params: {
          message: 'Nested?',
          requestedSchema: {
            type: 'object',
            properties: { nested: { type: 'object', properties: {} } },
          },
        },
      }),
    ).rejects.toMatchObject({ code: -32602 })
    expect(log.list('first')[0]).toMatchObject({
      server: 'files',
      toolCallId: 'call-1',
      requestText: 'Nested?',
      outcome: 'refused',
    })
    expect(events.at(-1)).toMatchObject({ type: 'mcp_exchange_recorded', exchange: { outcome: 'refused' } })
  })
})
