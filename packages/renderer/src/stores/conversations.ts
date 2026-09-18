import {
  type ApprovalAnswerInput,
  type ChatMessage,
  type ConversationSummary,
  type EditEffect,
  emptyTranscript,
  openingTranscript,
  type PermissionLevel,
  type RuntimeEvent,
  reduceTranscript,
  type ThinkingLevel,
  type TranscriptState,
} from '@alpha/core'
import { create } from 'zustand'
import { bridge } from '../lib/bridge.ts'

export interface ConversationStore {
  list: ConversationSummary[]
  activeId: string
  transcript: TranscriptState
  loadList: () => Promise<void>
  create: (workspacePath: string) => Promise<string>
  open: (id: string) => Promise<void>
  send: (text: string) => Promise<void>
  /** First send in a workspace creates the conversation it belongs to. */
  sendOrCreate: (workspacePath: string, text: string) => Promise<string>
  /** Every runtime event the window receives passes through here. */
  applyEvent: (event: RuntimeEvent) => void
  setModel: (providerId: string, modelId: string) => Promise<void>
  setThinkingLevel: (level: ThinkingLevel) => Promise<void>
  setLevel: (level: PermissionLevel) => Promise<void>
  /** The answer a card was clicked with, on its way to the gate that is waiting for it. */
  answerApproval: (answer: Omit<ApprovalAnswerInput, 'conversationId'>) => Promise<void>
  /** A message for the running turn, or one queued behind it. */
  steer: (text: string) => Promise<void>
  queueMessage: (text: string) => Promise<void>
  cancelQueued: (entryId: string) => Promise<void>
  stop: () => Promise<void>
  regenerate: () => Promise<void>
  editMessage: (userMessageIndex: number, text: string, effect: EditEffect) => Promise<void>
  rename: (id: string, title: string) => Promise<void>
  remove: (id: string) => Promise<void>
  exportMarkdown: (id: string) => Promise<string>
  /** Bumped when a card is answered, so the composer can take the focus back. */
  composerFocus: number
  /** The pane with nothing in it: the next message starts a conversation of its own. */
  startNew: () => void
}

const listWithUpdated = (list: ConversationSummary[], updated: ConversationSummary): ConversationSummary[] =>
  list.some((conversation) => conversation.id === updated.id)
    ? list.map((conversation) => (conversation.id === updated.id ? updated : conversation))
    : [updated, ...list]

export const useConversations = create<ConversationStore>((set, get) => ({
  list: [],
  activeId: '',
  transcript: emptyTranscript(''),
  composerFocus: 0,

  loadList: async () => set({ list: await bridge().listConversations() }),

  // Forgetting the open conversation is what makes the next message a new one: without it the
  // pane kept the old transcript and the composer went on talking to the old conversation.
  startNew: () => set({ activeId: '', transcript: emptyTranscript('') }),

  create: async (workspacePath: string) => {
    const opened = await bridge().createConversation(workspacePath)
    set({
      list: listWithUpdated(get().list, opened.conversation),
      activeId: opened.conversation.id,
      transcript: openingTranscript(opened.conversation.id, opened.conversation, opened.messages, opened.usage),
    })
    return opened.conversation.id
  },

  open: async (id: string) => {
    const opened = await bridge().openConversation(id)
    set({
      list: listWithUpdated(get().list, opened.conversation),
      activeId: id,
      transcript: openingTranscript(id, opened.conversation, opened.messages, opened.usage),
    })
  },

  send: async (text: string) => {
    const id = get().activeId
    if (id === '') return
    // The user's own message shows up when the runtime reports it, so the transcript never
    // shows a message the runtime has not accepted.
    await bridge().sendPrompt(id, text)
  },

  sendOrCreate: async (workspacePath: string, text: string) => {
    let id = get().activeId
    try {
      id = id === '' ? await get().create(workspacePath) : id
      await bridge().sendPrompt(id, text)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const transcript = get().transcript
      set({
        transcript: reduceTranscript(transcript, {
          conversationId: transcript.conversationId,
          type: 'run_failed',
          message,
        }),
      })
    }
    return id
  },

  setModel: async (providerId: string, modelId: string) => {
    const id = get().activeId
    if (id === '') return
    const conversation = await bridge().setConversationModel(id, providerId, modelId)
    set({
      list: listWithUpdated(get().list, conversation),
      transcript: reduceTranscript(get().transcript, {
        conversationId: id,
        type: 'conversation_updated',
        conversation,
      }),
    })
  },

  setThinkingLevel: async (level: ThinkingLevel) => {
    const id = get().activeId
    if (id === '') return
    const conversation = await bridge().setThinkingLevel(id, level)
    set({
      list: listWithUpdated(get().list, conversation),
      transcript: reduceTranscript(get().transcript, {
        conversationId: id,
        type: 'conversation_updated',
        conversation,
      }),
    })
  },

  steer: async (text) => {
    const id = get().activeId
    if (id !== '') await bridge().steer(id, text)
  },

  queueMessage: async (text) => {
    const id = get().activeId
    if (id !== '') await bridge().queueMessage(id, text)
  },

  cancelQueued: async (entryId) => {
    const id = get().activeId
    if (id !== '') await bridge().cancelQueued(id, entryId)
  },

  stop: async () => {
    const id = get().activeId
    if (id !== '') await bridge().abortRun(id)
  },

  regenerate: async () => {
    const id = get().activeId
    if (id !== '') await bridge().regenerate(id)
  },

  editMessage: async (userMessageIndex, text, effect) => {
    const id = get().activeId
    if (id === '') return
    const opened = await bridge().editMessage(id, userMessageIndex, text, effect)
    set({
      list: listWithUpdated(get().list, opened.conversation),
      activeId: opened.conversation.id,
      transcript: openingTranscript(opened.conversation.id, opened.conversation, opened.messages, opened.usage),
    })
  },

  rename: async (id, title) => {
    const updated = await bridge().renameConversation(id, title)
    set({
      list: listWithUpdated(get().list, updated),
      transcript: reduceTranscript(get().transcript, {
        conversationId: get().transcript.conversationId,
        type: 'conversation_updated',
        conversation: updated,
      }),
    })
  },

  remove: async (id) => {
    set({ list: await bridge().deleteConversation(id) })
    if (get().activeId === id) set({ activeId: '', transcript: emptyTranscript('') })
  },

  exportMarkdown: async (id) => (await bridge().exportConversation(id)).path,

  setLevel: async (level) => {
    const id = get().activeId
    if (id === '') return
    const conversation = await bridge().setConversationLevel(id, level)
    set({
      list: listWithUpdated(get().list, conversation),
      transcript: reduceTranscript(get().transcript, {
        conversationId: id,
        type: 'conversation_updated',
        conversation,
      }),
    })
  },

  answerApproval: async (answer) => {
    const id = get().activeId
    if (id === '') return
    await bridge().answerApproval({ ...answer, conversationId: id })
    set({ composerFocus: get().composerFocus + 1 })
  },

  applyEvent: (event: RuntimeEvent) => {
    const state = get()
    if (event.type === 'conversation_updated') set({ list: listWithUpdated(state.list, event.conversation) })
    // The open conversation's summary follows the event as well: the header shows the name the
    // sidebar shows, and the model and level the conversation is actually running under.
    if (event.conversationId !== state.activeId) return
    set({ transcript: reduceTranscript(state.transcript, event) })
  },
}))

export type { ChatMessage }
