import type { ApprovalAnswerInput, EditEffect, OpenedConversation } from '@alpha/contract'
import {
  type Attachment,
  type ChatMessage,
  type ConversationSummary,
  emptyTranscript,
  type McpElicitationAnswer,
  type McpSamplingAnswer,
  openingTranscript,
  type PermissionLevel,
  type RuntimeEvent,
  reduceTranscript,
  type ThinkingLevel,
  type TranscriptState,
} from '@alpha/domain'
import { createStore } from 'solid-js/store'
import { bridge } from '../lib/bridge.ts'

export interface ConversationsState {
  list: ConversationSummary[]
  /** Whether the list has been read once: "no conversations" and "not read yet" look the same. */
  listed: boolean
  activeId: string
  transcript: TranscriptState
  openFailure?: string
  /** Bumped when a card is answered, so the composer can take the focus back. */
  composerFocus: number
}

/**
 * The conversations, and the one that is open. The transcript is a projection of the runtime's
 * events (C2.3): events arrive through `applyEvent` and change nothing else.
 */
const [conversations, setConversations] = createStore<ConversationsState>({
  list: [],
  listed: false,
  activeId: '',
  transcript: emptyTranscript(''),
  composerFocus: 0,
})

let selectionVersion = 0

export { conversations }

const listWithUpdated = (list: ConversationSummary[], updated: ConversationSummary): ConversationSummary[] =>
  list.some((conversation) => conversation.id === updated.id)
    ? list.map((conversation) => (conversation.id === updated.id ? updated : conversation))
    : [updated, ...list]

const openedState = (opened: OpenedConversation) => ({
  list: listWithUpdated(conversations.list, opened.conversation),
  activeId: opened.conversation.id,
  transcript: openingTranscript(
    opened.conversation.id,
    opened.conversation,
    opened.messages,
    opened.usage,
    opened.workspaceChanges,
    opened.mcpExchanges,
    opened.mcpPending,
    opened.mcpSamplingPending,
  ),
})

export const conversationActions = {
  loadList: async (): Promise<void> => {
    setConversations({ list: await bridge().listConversations(), listed: true })
  },

  // Forgetting the open conversation is what makes the next message a new one: without it the
  // pane kept the old transcript and the composer went on talking to the old conversation.
  startNew: (): void => {
    selectionVersion += 1
    setConversations({ activeId: '', transcript: emptyTranscript(''), openFailure: undefined })
  },

  create: async (workspacePath: string): Promise<string> => {
    const version = ++selectionVersion
    const opened = await bridge().createConversation(workspacePath)
    if (version === selectionVersion) setConversations(openedState(opened))
    else setConversations('list', listWithUpdated(conversations.list, opened.conversation))
    return opened.conversation.id
  },

  open: async (id: string): Promise<void> => {
    const version = ++selectionVersion
    setConversations({ activeId: id, transcript: emptyTranscript(id), openFailure: undefined })
    try {
      const opened = await bridge().openConversation(id)
      if (version === selectionVersion)
        setConversations({ ...openedState(opened), activeId: id, openFailure: undefined })
    } catch (error) {
      if (version === selectionVersion)
        setConversations('openFailure', error instanceof Error ? error.message : String(error))
    }
  },

  send: async (text: string): Promise<void> => {
    const id = conversations.activeId
    if (id === '') return
    // The user's own message shows up when the runtime reports it, so the transcript never
    // shows a message the runtime has not accepted.
    await bridge().sendPrompt(id, text)
  },

  sendOrCreate: async (workspacePath: string, text: string, attachments?: Attachment[]): Promise<string> => {
    let id = conversations.activeId
    let version = selectionVersion
    try {
      if (id === '') {
        const creating = conversationActions.create(workspacePath)
        version = selectionVersion
        id = await creating
      }
      await bridge().sendPrompt(id, text, attachments)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (version === selectionVersion && id === conversations.activeId) {
        setConversations('transcript', (transcript) =>
          reduceTranscript(transcript, {
            conversationId: transcript.conversationId,
            type: 'run_failed',
            message,
          }),
        )
      }
    }
    return id
  },

  // Changing a conversation is asked for here and reported back as an event, like every other
  // change to one: the store has a single road for a new summary and no caller has to remember it.
  setModel: async (providerId: string, modelId: string): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().setConversationModel(id, providerId, modelId)
  },

  setThinkingLevel: async (level: ThinkingLevel): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().setThinkingLevel(id, level)
  },

  steer: async (text: string): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().steer(id, text)
  },

  queueMessage: async (text: string): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().queueMessage(id, text)
  },

  editQueued: async (entryId: string, text: string): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().editQueued(id, entryId, text)
  },

  resumeQueue: async (): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().resumeQueue(id)
  },

  cancelQueued: async (entryId: string): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().cancelQueued(id, entryId)
  },

  stop: async (): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().abortRun(id)
  },

  regenerate: async (): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().regenerate(id)
  },

  editMessage: async (userMessageIndex: number, text: string, effect: EditEffect): Promise<void> => {
    const id = conversations.activeId
    if (id === '') return
    const version = selectionVersion
    const opened = await bridge().editMessage(id, userMessageIndex, text, effect)
    if (version === selectionVersion && conversations.activeId === id) setConversations(openedState(opened))
    else setConversations('list', listWithUpdated(conversations.list, opened.conversation))
  },

  rename: async (id: string, title: string): Promise<void> => {
    await bridge().renameConversation(id, title)
  },

  archive: async (id: string): Promise<void> => {
    setConversations('list', await bridge().archiveConversation(id))
  },

  unarchive: async (id: string): Promise<void> => {
    setConversations('list', await bridge().unarchiveConversation(id))
  },

  remove: async (id: string): Promise<void> => {
    setConversations('list', await bridge().deleteConversation(id))
    if (conversations.activeId === id) {
      setConversations({ activeId: '', transcript: emptyTranscript('') })
    }
  },

  exportMarkdown: async (id: string): Promise<string> => (await bridge().exportConversation(id)).path,

  setLevel: async (level: PermissionLevel): Promise<void> => {
    const id = conversations.activeId
    if (id !== '') await bridge().setConversationLevel(id, level)
  },

  answerApproval: async (answer: Omit<ApprovalAnswerInput, 'conversationId'>): Promise<void> => {
    const id = conversations.activeId
    if (id === '') return
    await bridge().answerApproval({ ...answer, conversationId: id })
    setConversations('composerFocus', conversations.composerFocus + 1)
  },

  answerMcpElicitation: async (answer: McpElicitationAnswer & { requestId: string }): Promise<void> => {
    const id = conversations.activeId
    if (id === '') return
    await bridge().answerMcpElicitation({ ...answer, conversationId: id })
    setConversations('composerFocus', conversations.composerFocus + 1)
  },

  answerMcpSampling: async (answer: McpSamplingAnswer & { requestId: string }): Promise<void> => {
    const id = conversations.activeId
    if (id === '') return
    await bridge().answerMcpSampling({ ...answer, conversationId: id })
    setConversations('composerFocus', conversations.composerFocus + 1)
  },

  applyEvent: (event: RuntimeEvent): void => {
    if (event.type === 'conversation_updated') {
      setConversations('list', listWithUpdated(conversations.list, event.conversation))
    }
    // The open conversation's summary follows the event as well: the header shows the name the
    // sidebar shows, and the model and level the conversation is actually running under.
    if (event.conversationId !== conversations.activeId) return
    setConversations('transcript', reduceTranscript(conversations.transcript, event))
  },
}

export type { ChatMessage }
