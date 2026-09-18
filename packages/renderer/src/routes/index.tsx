import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ConversationPane } from '../components/ConversationPane.tsx'
import { useConversations } from '../stores/conversations.ts'
import { useShell } from '../stores/shell.ts'

/**
 * Comes back to the conversation that was open when the window last closed. The conversation
 * route reads the transcript off the session file, so a relaunch costs nothing but the
 * navigation (T2).
 */
function useResumeLastConversation(): void {
  const remembered = useShell((state) => state.lastConversationId)
  const clearResume = useShell((state) => state.clearResume)
  const list = useConversations((state) => state.list)
  const navigate = useNavigate()

  useEffect(() => {
    if (remembered === '') return
    if (!list.some((conversation) => conversation.id === remembered)) return
    // The memory is spent here rather than in a ref: a ref would re-arm every time this route
    // mounts, and "New conversation" would keep bouncing back to the one that was open.
    clearResume()
    void navigate({ to: '/c/$conversationId', params: { conversationId: remembered } })
  }, [remembered, list, navigate, clearResume])
}

/** The "no conversation yet" state: the composer here starts one. */
function NewConversation() {
  const startNew = useConversations((state) => state.startNew)

  // This route is "no conversation": whatever was open stays in the sidebar, and the next message
  // starts something else.
  useEffect(() => {
    startNew()
  }, [startNew])

  useResumeLastConversation()
  return <ConversationPane />
}

export const Route = createFileRoute('/')({ component: NewConversation })
