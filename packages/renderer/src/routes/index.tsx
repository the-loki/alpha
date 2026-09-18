import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
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
  const list = useConversations((state) => state.list)
  const navigate = useNavigate()
  // Once per launch: after this, an empty pane stays an empty pane.
  const tried = useRef(false)

  useEffect(() => {
    if (tried.current || remembered === '') return
    if (!list.some((conversation) => conversation.id === remembered)) return
    tried.current = true
    void navigate({ to: '/c/$conversationId', params: { conversationId: remembered } })
  }, [remembered, list, navigate])
}

/** The "no conversation yet" state: the composer here starts one. */
function NewConversation() {
  useResumeLastConversation()
  return <ConversationPane />
}

export const Route = createFileRoute('/')({ component: NewConversation })
