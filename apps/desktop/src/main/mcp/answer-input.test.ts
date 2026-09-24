import { describe, expect, it } from 'vitest'
import { readMcpElicitationAnswer, readMcpSamplingAnswer } from '../argument-readers.ts'

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

describe('[main] MCP sampling answers at the IPC boundary', () => {
  it('keeps edited text for generate and keeps later decisions separate', () => {
    expect(
      readMcpSamplingAnswer({
        conversationId: 'one',
        requestId: 'req',
        action: 'generate',
        messages: ['Edited'],
        systemPrompt: 'Instructions',
      }),
    ).toEqual({
      conversationId: 'one',
      requestId: 'req',
      action: 'generate',
      messages: ['Edited'],
      systemPrompt: 'Instructions',
    })
    expect(readMcpSamplingAnswer({ conversationId: 'one', requestId: 'req', action: 'share' })).toEqual({
      conversationId: 'one',
      requestId: 'req',
      action: 'share',
    })
    expect(readMcpSamplingAnswer({ conversationId: 'one', requestId: 'req', action: 'decline' })).toMatchObject({
      action: 'decline',
    })
    expect(readMcpSamplingAnswer({ conversationId: 'one', requestId: 'req', action: 'cancel' })).toMatchObject({
      action: 'cancel',
    })
  })

  it('rejects nested, missing and oversized edits', () => {
    expect(() =>
      readMcpSamplingAnswer({
        conversationId: 'one',
        requestId: 'req',
        action: 'generate',
        messages: [{ text: 'Nested' }],
      }),
    ).toThrow()
    expect(() =>
      readMcpSamplingAnswer({
        conversationId: 'one',
        requestId: 'req',
        action: 'generate',
        messages: ['x'.repeat(10_001)],
      }),
    ).toThrow()
    expect(() =>
      readMcpSamplingAnswer({ conversationId: 'one', requestId: 'req', action: 'share', messages: ['unexpected'] }),
    ).toThrow()
    expect(() => readMcpSamplingAnswer({ conversationId: '', requestId: 'req', action: 'share' })).toThrow()
  })
})
