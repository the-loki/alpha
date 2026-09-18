import { createFileRoute } from '@tanstack/react-router'
import { ConversationPane } from '../components/ConversationPane.tsx'

/** The "no conversation yet" state: the composer here starts one. */
function NewConversation() {
  return <ConversationPane />
}

export const Route = createFileRoute('/')({ component: NewConversation })
