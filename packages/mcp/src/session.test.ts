import { describe, expect, it } from 'vitest'
import { createSession, type FrameHandlers } from './session.ts'

function localSession() {
  const sent: Array<Record<string, unknown>> = []
  let handlers: FrameHandlers | undefined
  let pendingAnswer: ((value: unknown) => void) | undefined
  let serverSignal: AbortSignal | undefined
  const session = createSession(
    (opened) => {
      handlers = opened
      return {
        send: async (text) => {
          sent.push(JSON.parse(text) as Record<string, unknown>)
        },
        close: () => {},
      }
    },
    undefined,
    {
      server: 'local',
      handle: async ({ signal }) => {
        serverSignal = signal
        return await new Promise<unknown>((resolve) => {
          pendingAnswer = resolve
        })
      },
    },
  )
  const receive = (message: object): void => handlers?.message(JSON.stringify({ jsonrpc: '2.0', ...message }))
  return {
    session,
    sent,
    receive,
    answer: (value: unknown) => pendingAnswer?.(value),
    serverSignal: () => serverSignal,
    disconnect: () => handlers?.closed('server disconnected'),
  }
}

const context = { conversationId: 'conversation-1', toolCallId: 'call-1' }

describe('server-origin requests', () => {
  it('keeps same-direction cancellation separate from the pending client call', async () => {
    const link = localSession()
    const tool = link.session.request('tools/call', {}, undefined, context)
    link.receive({ id: 1, method: 'elicitation/create', params: { message: 'Name?' } })
    await Promise.resolve()
    expect(link.serverSignal()?.aborted).toBe(false)

    link.receive({ method: 'notifications/cancelled', params: { requestId: 1 } })
    expect(link.serverSignal()?.aborted).toBe(true)
    link.answer({ action: 'accept' })
    await Promise.resolve()
    await Promise.resolve()
    expect(link.sent).toEqual([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }])

    link.receive({ id: 1, result: { content: [] } })
    await expect(tool).resolves.toEqual({ content: [] })
    link.session.close()
  })

  it('ends an inbound request when its parent is stopped or the server disconnects', async () => {
    const link = localSession()
    const stop = new AbortController()
    const tool = link.session.request('tools/call', {}, stop.signal, context)
    link.receive({ id: 'server-1', method: 'elicitation/create', params: {} })
    await Promise.resolve()
    stop.abort()
    expect(link.serverSignal()?.aborted).toBe(true)
    await expect(tool).rejects.toThrow(/stopped/)
    link.answer({ action: 'accept' })
    await Promise.resolve()
    await Promise.resolve()
    expect(link.sent.some((message) => message.id === 'server-1')).toBe(false)
    expect(link.sent).toContainEqual({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 1, reason: 'the caller stopped waiting' },
    })

    const another = link.session.request('tools/call', {}, undefined, context)
    link.receive({ id: 'server-2', method: 'elicitation/create', params: {} })
    await Promise.resolve()
    link.disconnect()
    expect(link.serverSignal()?.aborted).toBe(true)
    await expect(another).rejects.toThrow('server disconnected')
  })

  it('does not open a request that the server cancels in the same read batch', async () => {
    const link = localSession()
    const tool = link.session.request('tools/call', {}, undefined, context)
    link.receive({ id: 'server-1', method: 'elicitation/create', params: {} })
    link.receive({ method: 'notifications/cancelled', params: { requestId: 'server-1' } })
    await Promise.resolve()
    expect(link.serverSignal()).toBeUndefined()
    expect(link.sent.some((message) => message.id === 'server-1')).toBe(false)
    link.receive({ id: 1, result: { content: [] } })
    await expect(tool).resolves.toEqual({ content: [] })
    link.session.close()
  })
})
