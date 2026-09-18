/**
 * What the window can ask of a conversation while it is open: steer it, queue behind it, stop it,
 * answer a message again, or change the history by editing an earlier message. Each of these is a
 * sequence over the runtime and the index, kept here so the manager stays about which
 * conversations exist rather than what can be done to one.
 */
import type { ConversationSummary, EditEffect, OpenedConversation } from '@alpha/core'
import type { ConversationRuntime } from './conversation-runtime.ts'
import { findSessionMetadata } from './conversation-runtime.ts'
import { forkConversation } from './fork.ts'

export interface TurnPorts {
  /** Throws when there is no such conversation. */
  conversation: (id: string) => ConversationSummary
  /** The runtime for a conversation, opening it first when it is not already open. */
  runtime: (id: string) => Promise<ConversationRuntime>
  /** Records a conversation the index has not seen before, which is what a fork produces. */
  register: (conversation: ConversationSummary) => void
  openConversation: (id: string) => Promise<OpenedConversation>
  sessionsRoot: string
}

/** A message for the running turn: it arrives now and changes what the agent does next. */
export async function steerConversation(ports: TurnPorts, id: string, text: string): Promise<void> {
  const runtime = await ports.runtime(id)
  await runtime.steer(text)
}

/** A message for after the running turn: it waits, and can be taken back until then. */
export async function queueMessage(ports: TurnPorts, id: string, text: string): Promise<void> {
  const runtime = await ports.runtime(id)
  await runtime.followUp(text)
}

export async function cancelQueued(ports: TurnPorts, id: string, entryId: string): Promise<void> {
  const runtime = await ports.runtime(id)
  await runtime.cancelQueued(entryId)
}

/** Answers the last user message again, with the replaced answer leaving the transcript's path. */
export async function regenerate(ports: TurnPorts, id: string): Promise<void> {
  requireIdle(ports, id)
  const runtime = await ports.runtime(id)
  await runtime.regenerate()
}

/** Summarises the history now; the runtime does this by itself when it runs out of room. */
export async function compactConversation(ports: TurnPorts, id: string): Promise<boolean> {
  const runtime = await ports.runtime(id)
  return runtime.compact()
}

/**
 * Replaces an earlier user message. `replace` continues this conversation from the edit; `fork`
 * copies the conversation up to (but not including) the edited message into a new one, so both
 * versions stay readable and neither is a lie about what happened.
 */
export async function editMessage(
  ports: TurnPorts,
  id: string,
  userMessageIndex: number,
  text: string,
  effect: EditEffect,
): Promise<OpenedConversation> {
  requireIdle(ports, id)
  const runtime = await ports.runtime(id)
  const conversation = ports.conversation(id)
  if (effect === 'replace') {
    await runtime.resend(userMessageIndex, text)
    return { conversation, messages: await runtime.transcript(), usage: await runtime.usage() }
  }

  const entryId = await runtime.userEntryId(userMessageIndex)
  if (entryId === undefined) throw new Error('That message is not in this conversation.')
  const source = await findSessionMetadata({
    sessionsRoot: ports.sessionsRoot,
    workspacePath: conversation.workspacePath,
    conversationId: id,
  })
  if (source === undefined) throw new Error('That conversation is not on disk yet.')
  const forked = await forkConversation({
    source,
    conversation,
    entryId,
    text,
    sessionsRoot: ports.sessionsRoot,
  })
  ports.register(forked)
  const opened = await ports.openConversation(forked.id)
  const forkedRuntime = await ports.runtime(forked.id)
  await forkedRuntime.prompt(text)
  return { conversation: forked, messages: opened.messages, usage: opened.usage }
}

/** Editing or regenerating while a turn is in flight would be a decision made too early. */
function requireIdle(ports: TurnPorts, id: string): void {
  if (ports.conversation(id).status === 'running') {
    throw new Error('The agent is still working on this conversation.')
  }
}
