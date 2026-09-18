import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ConversationPane } from '../components/ConversationPane.tsx'
import { useConversations } from '../stores/conversations.ts'

function ConversationRoute() {
  const { conversationId } = Route.useParams()
  const activeId = useConversations((state) => state.activeId)
  const open = useConversations((state) => state.open)

  useEffect(() => {
    if (conversationId !== activeId) void open(conversationId)
  }, [conversationId, activeId, open])

  return <ConversationPane />
}

export const Route = createFileRoute('/c/$conversationId')({ component: ConversationRoute })
