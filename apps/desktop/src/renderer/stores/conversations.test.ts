import type { AlphaBridge, OpenedConversation } from '@alpha/contract'
import { EMPTY_USAGE } from '@alpha/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bridge } from '../lib/bridge.ts'
import { conversationActions, conversations } from './conversations.ts'

vi.mock('../lib/bridge.ts', () => ({ bridge: vi.fn() }))

const opened = (id: string): OpenedConversation => ({
  conversation: {
    id,
    workspacePath: '/workspace',
    title: id,
    createdAt: 1,
    updatedAt: 1,
    status: 'idle',
    permissionLevel: 'ask',
    model: { providerId: 'provider', modelId: 'model' },
    thinkingLevel: 'medium',
  },
  messages: [
    { id: `message-${id}`, role: 'user', blocks: [{ kind: 'text', text: id }], createdAt: 1, status: 'complete' },
  ],
  usage: EMPTY_USAGE,
  workspaceChanges: [],
  mcpExchanges: [],
  mcpPending: [],
  mcpSamplingPending: [],
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('[renderer] conversation selection', () => {
  beforeEach(() => {
    conversationActions.startNew()
    vi.mocked(bridge).mockReset()
  })

  it('selects the requested conversation before it opens and ignores an older answer', async () => {
    const first = deferred<OpenedConversation>()
    const second = deferred<OpenedConversation>()
    vi.mocked(bridge).mockReturnValue({
      openConversation: vi.fn((id: string) => (id === 'first' ? first.promise : second.promise)),
    } as unknown as AlphaBridge)

    const openFirst = conversationActions.open('first')
    expect(conversations.activeId).toBe('first')
    expect(conversations.transcript.conversationId).toBe('first')

    const openSecond = conversationActions.open('second')
    expect(conversations.activeId).toBe('second')
    expect(conversations.transcript.summary).toBeUndefined()

    second.resolve(opened('second'))
    await openSecond
    first.resolve(opened('first'))
    await openFirst
    expect(conversations.activeId).toBe('second')
    expect(conversations.transcript.messages[0]?.id).toBe('message-second')
  })

  it('does not reopen a conversation after the user starts a new one', async () => {
    const pending = deferred<OpenedConversation>()
    vi.mocked(bridge).mockReturnValue({ openConversation: vi.fn(() => pending.promise) } as unknown as AlphaBridge)

    const opening = conversationActions.open('old')
    conversationActions.startNew()
    pending.resolve(opened('old'))
    await opening

    expect(conversations.activeId).toBe('')
    expect(conversations.transcript.summary).toBeUndefined()
  })

  it('keeps the chosen conversation when a new one finishes creating elsewhere', async () => {
    const pending = deferred<OpenedConversation>()
    const sendPrompt = vi.fn(async () => undefined)
    vi.mocked(bridge).mockReturnValue({
      createConversation: vi.fn(() => pending.promise),
      openConversation: vi.fn(async () => opened('chosen')),
      sendPrompt,
    } as unknown as AlphaBridge)

    const sending = conversationActions.sendOrCreate('/workspace', 'work on this')
    await conversationActions.open('chosen')
    pending.resolve(opened('created'))
    expect(await sending).toEqual({ id: 'created', accepted: true, current: false })

    expect(sendPrompt).toHaveBeenCalledWith('created', 'work on this', undefined)
    expect(conversations.activeId).toBe('chosen')
    expect(conversations.transcript.messages[0]?.id).toBe('message-chosen')
  })

  it('reports a failed open so the selected route can offer a retry', async () => {
    vi.mocked(bridge).mockReturnValue({
      openConversation: vi.fn(async () => {
        throw new Error('Conversation is unavailable')
      }),
    } as unknown as AlphaBridge)

    await conversationActions.open('missing')
    expect(conversations.activeId).toBe('missing')
    expect(conversations.openFailure).toBe('Conversation is unavailable')
  })

  it('does not replace another conversation with a late edit result', async () => {
    const pending = deferred<OpenedConversation>()
    vi.mocked(bridge).mockReturnValue({
      openConversation: vi.fn(async (id: string) => opened(id)),
      editMessage: vi.fn(() => pending.promise),
    } as unknown as AlphaBridge)

    await conversationActions.open('edited')
    const editing = conversationActions.editMessage(0, 'revised', 'replace')
    await conversationActions.open('chosen')
    pending.resolve(opened('edited'))
    await editing

    expect(conversations.activeId).toBe('chosen')
    expect(conversations.transcript.messages[0]?.id).toBe('message-chosen')
  })

  it('does not show an earlier conversation’s send failure in the chosen transcript', async () => {
    let fail!: (reason: Error) => void
    const pending = new Promise<void>((_resolve, reject) => {
      fail = reject
    })
    vi.mocked(bridge).mockReturnValue({
      openConversation: vi.fn(async (id: string) => opened(id)),
      sendPrompt: vi.fn(() => pending),
    } as unknown as AlphaBridge)

    await conversationActions.open('earlier')
    const sending = conversationActions.sendOrCreate('/workspace', 'send this')
    await conversationActions.open('chosen')
    fail(new Error('Earlier send failed'))
    await sending

    expect(conversations.transcript.conversationId).toBe('chosen')
    expect(conversations.transcript.status).toBe('idle')
  })

  it('does not record an unsent message as a failed turn', async () => {
    vi.mocked(bridge).mockReturnValue({
      openConversation: vi.fn(async () => opened('existing')),
      sendPrompt: vi.fn(async () => {
        throw new Error('Transport refused the message')
      }),
    } as unknown as AlphaBridge)

    await conversationActions.open('existing')
    const result = await conversationActions.sendOrCreate('/workspace', 'unsent')

    expect(result).toMatchObject({ id: 'existing', accepted: false, error: 'Transport refused the message' })
    expect(conversations.transcript.messages.map((message) => message.id)).toEqual(['message-existing'])
    expect(conversations.transcript.status).toBe('idle')
  })
})
