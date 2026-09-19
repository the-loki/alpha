import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChatMessage, RuntimeEvent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { CredentialVault, type SecretCipher } from '../providers/credential-vault.ts'
import { ProviderStore } from '../providers/store.ts'
import { StateStore } from '../state-store.ts'
import { RuntimeManager } from './manager.ts'

/**
 * The queue the workbench owns (ADR-0011), through the real manager and a scripted model: a
 * message waits for the turn in front of it, is sent as a turn of its own, can be edited where it
 * stands, and stops moving when the run it waited behind fails or the user stops it.
 */
const testCipher: SecretCipher = {
  available: true,
  encrypt: (plaintext) => `enc:${plaintext}`,
  decrypt: (payload) => payload.replace(/^enc:/, ''),
}

const freshManager = (
  events: RuntimeEvent[],
  replies: unknown[] = ['The first answer.', 'The second answer.'],
  env: NodeJS.ProcessEnv = {},
) => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-data-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-workspace-'))
  const manager = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers: new ProviderStore(dataDirectory, new CredentialVault(dataDirectory, testCipher)),
    store: new StateStore(dataDirectory),
    env: { ALPHA_FAUX: '1', ALPHA_FAUX_REPLIES: JSON.stringify(replies), ...env },
    emit: (event) => events.push(event),
    emitRules: () => undefined,
  })
  return { manager, workspace }
}

const queueOf = (events: RuntimeEvent[], id: string) =>
  events.filter((event) => event.type === 'queue_updated' && event.conversationId === id).at(-1)

const userTexts = (messages: ChatMessage[]): string[] =>
  messages
    .filter((message) => message.role === 'user')
    .flatMap((message) =>
      message.blocks.map((block) => ('text' in (block as object) ? (block as { text: string }).text : '')),
    )

/** A turn that is still going when the test wants to queue something behind it. */
const slowReplies = [
  { tool: { name: 'bash', args: { command: 'sleep 0.4' } } },
  'The first answer.',
  'The second answer.',
]

describe('[runtime] the queue of messages waiting to be sent', () => {
  it('waits behind the running turn, then goes as a turn of its own', async () => {
    const events: RuntimeEvent[] = []
    const { manager, workspace } = freshManager(events, slowReplies)
    const created = await manager.create(workspace)
    const id = created.conversation.id
    // The scripted turn runs a command, and a gate that asked would wait for an answer forever.
    manager.setConversationLevel(id, 'full-access')

    const running = manager.prompt(id, 'first task')
    await new Promise((resolve) => setTimeout(resolve, 120))
    await manager.queueMessage(id, 'then do this')

    const waiting = queueOf(events, id)
    expect(waiting?.type === 'queue_updated' ? waiting.queued.map((item) => item.text) : []).toEqual(['then do this'])
    expect(waiting?.type === 'queue_updated' ? waiting.queued[0].kind : '').toBe('queued')

    await running
    await manager.closeAll()

    // Its own turn: the first question's answer is written before the queued message is read.
    const transcript = await manager.transcriptFor(id)
    expect(userTexts(transcript)).toEqual(['first task', 'then do this'])
  })

  it('edits one where it stands, and takes one back', async () => {
    const events: RuntimeEvent[] = []
    const { manager, workspace } = freshManager(events, slowReplies)
    const created = await manager.create(workspace)
    const id = created.conversation.id
    // The scripted turn runs a command, and a gate that asked would wait for an answer forever.
    manager.setConversationLevel(id, 'full-access')

    const running = manager.prompt(id, 'first task')
    await new Promise((resolve) => setTimeout(resolve, 120))
    await manager.queueMessage(id, 'the second thing')
    await manager.queueMessage(id, 'the third thing')

    const queued = queueOf(events, id)
    const items = queued?.type === 'queue_updated' ? queued.queued : []
    await manager.editQueued(id, items[0].entryId, 'the second thing, better')
    await manager.cancelQueued(id, items[1].entryId)

    const after = queueOf(events, id)
    expect(after?.type === 'queue_updated' ? after.queued.map((item) => item.text) : []).toEqual([
      'the second thing, better',
    ])

    await running
    await manager.closeAll()
  })

  it('stops when a message cannot be sent at all, and keeps it', async () => {
    const events: RuntimeEvent[] = []
    // No provider, so there is no model to send anything with: the message cannot leave.
    const { manager, workspace } = freshManager(events, [], { ALPHA_FAUX: '' })
    const created = await manager.create(workspace)
    const id = created.conversation.id

    await manager.queueMessage(id, 'this cannot be sent yet')

    const stopped = queueOf(events, id)
    expect(stopped?.type === 'queue_updated' ? stopped.paused : false).toBe(true)
    expect(stopped?.type === 'queue_updated' ? stopped.queued.map((item) => item.text) : []).toEqual([
      'this cannot be sent yet',
    ])

    await manager.closeAll()
  })

  it('stops when the user stops the run, and Resume sends what was waiting', async () => {
    const events: RuntimeEvent[] = []
    const { manager, workspace } = freshManager(events, slowReplies)
    const created = await manager.create(workspace)
    const id = created.conversation.id
    manager.setConversationLevel(id, 'full-access')

    const running = manager.prompt(id, 'first task')
    await new Promise((resolve) => setTimeout(resolve, 120))
    await manager.queueMessage(id, 'then do this')
    await manager.abort(id)
    await running.catch(() => undefined)

    const stopped = queueOf(events, id)
    expect(stopped?.type === 'queue_updated' ? stopped.paused : false).toBe(true)
    expect(stopped?.type === 'queue_updated' ? stopped.queued.map((item) => item.text) : []).toEqual(['then do this'])

    await manager.resumeQueue(id)
    await manager.closeAll()

    const transcript = await manager.transcriptFor(id)
    expect(userTexts(transcript)).toEqual(['first task', 'then do this'])
  })
})
