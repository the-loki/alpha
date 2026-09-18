import { useConversations } from '../stores/conversations.ts'
import { Composer } from './Composer.tsx'
import { EmptyState } from './EmptyState.tsx'
import { MessageList } from './MessageList.tsx'

/** The middle column: the transcript if there is one, the next action if there is not. */
export function ConversationPane() {
  const transcript = useConversations((state) => state.transcript)
  const hasMessages = transcript.messages.length > 0 || transcript.streaming !== undefined

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">{hasMessages ? <MessageList transcript={transcript} /> : <EmptyState />}</div>
      <Composer />
    </div>
  )
}
