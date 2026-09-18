/**
 * The two things the window can ask for that move a branch tip: answer the last question again,
 * and replace an earlier message. Both leave the transcript the window is showing off the branch,
 * so the rule they share — move the tip, then hand the window the transcript that is on it now —
 * lives here instead of in whichever caller remembered to do it.
 *
 * Editing into a fork is the third case, and it does not move this conversation's tip: the copy
 * is a conversation of its own, and the one on screen was not touched.
 */
import type { ChatMessage, ConversationSummary, EditEffect, OpenedConversation } from '@alpha/core'
import type { ConversationRuntime } from './conversation-runtime.ts'
import { forkConversation } from './fork.ts'
import { findSessionMetadata } from './session-reader.ts'

export interface EditingPorts {
  /** Throws when there is no such conversation. */
  conversation: (id: string) => ConversationSummary
  /** The runtime for a conversation, opening it first when it is not already open. */
  runtime: (id: string) => Promise<ConversationRuntime>
  /** Records a conversation the index has not seen before, which is what a fork produces. */
  register: (conversation: ConversationSummary) => void
  openConversation: (id: string) => Promise<OpenedConversation>
  sessionsRoot: string
  /** The window's copy of the transcript, replaced because what it showed is off the branch. */
  replaceTranscript: (id: string, messages: ChatMessage[]) => void
}

/** Answers the last user message again, with the replaced answer leaving the transcript's path. */
export async function regenerate(ports: EditingPorts, id: string): Promise<void> {
  const runtime = await idleRuntime(ports, id)
  if (!(await runtime.regenerate())) return
  ports.replaceTranscript(id, await runtime.transcript())
}

/**
 * Replaces an earlier user message. `replace` continues this conversation from the edit; `fork`
 * copies the conversation up to (but not including) the edited message into a new one, so both
 * versions stay readable and neither is a lie about what happened.
 */
export async function editMessage(
  ports: EditingPorts,
  id: string,
  userMessageIndex: number,
  text: string,
  effect: EditEffect,
): Promise<OpenedConversation> {
  const runtime = await idleRuntime(ports, id)
  const conversation = ports.conversation(id)
  if (effect === 'replace') {
    await runtime.resend(userMessageIndex, text)
    const messages = await runtime.transcript()
    ports.replaceTranscript(id, messages)
    return { conversation, messages, usage: await runtime.usage() }
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
async function idleRuntime(ports: EditingPorts, id: string): Promise<ConversationRuntime> {
  const runtime = await ports.runtime(id)
  if (runtime.isRunning()) throw new Error(`The agent is still working on this conversation.`)
  return runtime
}
