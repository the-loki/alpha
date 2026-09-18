import { useConversations } from '../stores/conversations.ts'
import { Composer } from './Composer.tsx'
import { ConversationHeader } from './ConversationHeader.tsx'
import { EmptyState } from './EmptyState.tsx'
import { MessageList } from './MessageList.tsx'

/** The middle column: the transcript if there is one, the next action if there is not. */
export function ConversationPane() {
  const transcript = useConversations((state) => state.transcript)
  const hasMessages = transcript.messages.length > 0 || transcript.streaming !== undefined

  return (
    <div className="flex h-full flex-col">
      <ConversationHeader />
      {/* A flex column, so the transcript inside it shrinks to the space left by the composer
          instead of growing to its own content and painting over it. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {hasMessages ? <MessageList transcript={transcript} /> : <EmptyState />}
      </div>
      <Composer />
    </div>
  )
}
