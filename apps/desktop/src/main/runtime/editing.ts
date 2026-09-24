/**
 * The two things the window can ask for that move a branch tip: answer the last question again,
 * and replace an earlier message. Both leave the transcript the window is showing off the branch,
 * so the rule they share — move the tip, then hand the window the transcript that is on it now —
 * lives here instead of in whichever caller remembered to do it.
 *
 * Moving the tip is a fork: the agent copies the session up to the entry and carries on in the
 * copy, which is a session of its own with an id of its own. What was replaced stays in the
 * session it was written to, and the conversation records the copy as the session it is on now.
 *
 * Editing into a fork is the third case, and it does not move this conversation's tip: the copy
 * is a conversation of its own, and the one on screen was not touched.
 */
import type { EditEffect, OpenedConversation } from '@alpha/contract'
import { type ChatMessage, type ConversationSummary, textOfContent } from '@alpha/domain'
import { type AgentPorts, type ConversationReads, forkSession } from '@alpha/sessions'
import type { ConversationRuntime } from './conversation-runtime.ts'

export interface EditingPorts {
  /** Throws when there is no such conversation. */
  conversation: (id: string) => ConversationSummary
  /** The runtime for a conversation, opening it first when it is not already open. */
  runtime: (id: string) => Promise<ConversationRuntime>
  /** Reading a conversation back, which is a different question from driving it. */
  reads: ConversationReads
  /** Records a conversation the index has not seen before, which is what a fork produces. */
  register: (conversation: ConversationSummary) => void
  openConversation: (id: string) => Promise<OpenedConversation>
  /** Records which session a conversation is on, after its tip has moved. */
  adopt: (id: string, sessionId: string) => void
  agent: AgentPorts
  /** The window's copy of the transcript, replaced because what it showed is off the branch. */
  replaceTranscript: (id: string, messages: ChatMessage[]) => void
}

/** Answers the last user message again, with the replaced answer leaving the transcript's path. */
export async function regenerate(ports: EditingPorts, id: string): Promise<void> {
  const runtime = await idleRuntime(ports, id)
  const last = ports.reads.userEntries(id).at(-1)
  const text = last === undefined ? '' : textOfContent(last.message?.content)
  if (text === '' || last === undefined) return
  if (!(await moveTip(ports, id, runtime, last.id))) return
  await runtime.prompt(text)
  await runtime.settle()
  ports.replaceTranscript(id, ports.reads.transcript(id))
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
  const entry = ports.reads.userEntries(id)[userMessageIndex]
  if (entry === undefined) throw new Error('That message is not in this conversation.')

  if (effect === 'replace') {
    if (await moveTip(ports, id, runtime, entry.id)) {
      await runtime.prompt(text)
      await runtime.settle()
      const messages = ports.reads.transcript(id)
      ports.replaceTranscript(id, messages)
      return ports.openConversation(id)
    }
    return ports.openConversation(id)
  }

  // The copy is made outside this conversation's runtime, so the conversation on screen is not
  // disturbed by it: the fork is a conversation of its own from here on.
  const forked = await forkSession(ports.agent, conversation, entry.id)
  if (forked === undefined) throw new Error('The agent could not copy this conversation.')
  const now = Date.now()
  const copy: ConversationSummary = {
    ...conversation,
    id: crypto.randomUUID(),
    sessionId: forked,
    title: conversation.title,
    createdAt: now,
    updatedAt: now,
    status: 'idle',
  }
  ports.register(copy)
  const forkedRuntime = await ports.runtime(copy.id)
  await forkedRuntime.prompt(text)
  await forkedRuntime.settle()
  return ports.openConversation(copy.id)
}

/** Moves the conversation's tip, recording the session the agent forked it into. */
async function moveTip(
  ports: EditingPorts,
  id: string,
  runtime: ConversationRuntime,
  entryId: string,
): Promise<boolean> {
  const forked = await runtime.forkAt(entryId)
  if (forked === undefined) return false
  ports.adopt(id, forked)
  return true
}

/** Editing or regenerating while a turn is in flight would be a decision made too early. */
async function idleRuntime(ports: EditingPorts, id: string): Promise<ConversationRuntime> {
  const runtime = await ports.runtime(id)
  if (runtime.isRunning()) throw new Error('The agent is still working on this conversation.')
  return runtime
}
