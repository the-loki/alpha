import { useNavigate } from '@solidjs/router'
import { createEffect, onMount } from 'solid-js'
import { ConversationPage } from '../components/conversation/ConversationPage.tsx'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { shell, shellActions } from '../stores/shell.ts'

/**
 * Comes back to the conversation that was open when the window last closed. The conversation
 * route reads the transcript off the session file, so a relaunch costs nothing but the
 * navigation.
 */
function useResumeLastConversation(): void {
  const navigate = useNavigate()

  createEffect(() => {
    const remembered = shell.lastConversationId
    if (remembered === '') return
    if (!conversations.list.some((conversation) => conversation.id === remembered)) return
    // The memory is spent here rather than kept until the route next mounts: a memory that stayed
    // would bounce "New conversation" back to the one that was open.
    shellActions.clearResume()
    navigate(`/c/${remembered}`)
  })
}

/** The "no conversation yet" state: the composer here starts one. */
export function NewConversation() {
  // This route is "no conversation": whatever was open stays in the sidebar, and the next message
  // starts something else.
  onMount(() => conversationActions.startNew())

  useResumeLastConversation()
  return <ConversationPage />
}
