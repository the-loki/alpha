import { describe, expect, it } from 'vitest'
import { readMcpElicitationAnswer } from '../argument-readers.ts'

describe('[main] MCP form answers at the IPC boundary', () => {
  it('keeps the three actions and primitive content', () => {
    expect(
      readMcpElicitationAnswer({
        conversationId: 'one',
        requestId: 'req',
        action: 'accept',
        content: { name: 'Ada', count: 2, urgent: false },
      }),
    ).toEqual({
      conversationId: 'one',
      requestId: 'req',
      action: 'accept',
      content: { name: 'Ada', count: 2, urgent: false },
    })
    expect(
      readMcpElicitationAnswer({
        conversationId: 'one',
        requestId: 'req',
        action: 'decline',
        content: { ignored: true },
      }),
    ).toEqual({ conversationId: 'one', requestId: 'req', action: 'decline' })
    expect(readMcpElicitationAnswer({ conversationId: 'one', requestId: 'req', action: 'cancel' })).toEqual({
      conversationId: 'one',
      requestId: 'req',
      action: 'cancel',
    })
  })

  it('rejects nested content and missing identity', () => {
    expect(() =>
      readMcpElicitationAnswer({
        conversationId: 'one',
        requestId: 'req',
        action: 'accept',
        content: { nested: { secret: 'x' } },
      }),
    ).toThrow()
    expect(() => readMcpElicitationAnswer({ conversationId: 'one', requestId: 'req', action: 'accept' })).toThrow()
    expect(() => readMcpElicitationAnswer({ conversationId: '', requestId: 'req', action: 'cancel' })).toThrow()
    expect(() => readMcpElicitationAnswer({ conversationId: 'one', requestId: 'req', action: 'always' })).toThrow()
  })
})
