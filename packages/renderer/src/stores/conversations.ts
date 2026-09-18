import {
  type ApprovalAnswerInput,
  type ChatMessage,
  type ConversationSummary,
  emptyTranscript,
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
  /** The answer a card was clicked with, on its way to the gate that is waiting for it. */
  answerApproval: (answer: Omit<ApprovalAnswerInput, 'conversationId'>) => Promise<void>
  /** Bumped when a card is answered, so the composer can take the focus back. */
  composerFocus: number
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

  create: async (workspacePath: string) => {
    const opened = await bridge().createConversation(workspacePath)
    set({
      list: listWithUpdated(get().list, opened.conversation),
      activeId: opened.conversation.id,
      transcript: reduceTranscript(emptyTranscript(opened.conversation.id), {
        conversationId: opened.conversation.id,
        type: 'conversation_opened',
        conversation: opened.conversation,
        messages: opened.messages,
      }),
    })
    return opened.conversation.id
  },

  open: async (id: string) => {
    const opened = await bridge().openConversation(id)
    set({
      list: listWithUpdated(get().list, opened.conversation),
      activeId: id,
      transcript: reduceTranscript(emptyTranscript(id), {
        conversationId: id,
        type: 'conversation_opened',
        conversation: opened.conversation,
        messages: opened.messages,
      }),
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

  answerApproval: async (answer) => {
    const id = get().activeId
    if (id === '') return
    await bridge().answerApproval({ ...answer, conversationId: id })
    set({ composerFocus: get().composerFocus + 1 })
  },

  applyEvent: (event: RuntimeEvent) => {
    const state = get()
    if (event.type === 'conversation_updated') {
      set({ list: listWithUpdated(state.list, event.conversation) })
      return
    }
    if (event.conversationId !== state.activeId) return
    set({ transcript: reduceTranscript(state.transcript, event) })
  },
}))

export type { ChatMessage }
