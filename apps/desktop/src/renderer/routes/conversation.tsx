import { useParams } from '@solidjs/router'
import { createEffect } from 'solid-js'
import { ConversationPage } from '../components/conversation/ConversationPage.tsx'
import { conversationActions, conversations } from '../stores/conversations.ts'

export function ConversationRoute() {
  const params = useParams()

  createEffect(() => {
    const id = params.conversationId
    if (id !== undefined && id !== conversations.activeId) void conversationActions.open(id)
  })

  return <ConversationPage />
}
