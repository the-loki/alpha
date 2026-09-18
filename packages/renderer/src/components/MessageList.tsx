import { type TranscriptState, visibleMessages } from '@alpha/core'
import { useEffect, useRef } from 'react'
import { ApprovalCard } from './ApprovalCard.tsx'
import { MessageView } from './MessageView.tsx'

/** Which user message this is, counting from the top, which is how an edit names its target. */
const userIndex = (messages: { role: string }[], index: number): number =>
  messages.slice(0, index + 1).filter((message) => message.role === 'user').length - 1

/**
 * The transcript. It sticks to the bottom while the reader is already there, and stops sticking
 * the moment they scroll up: reading back through a long answer should not be yanked away by the
 * next delta.
 */
export function MessageList({ transcript }: { transcript: TranscriptState }) {
  const container = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const messages = visibleMessages(transcript)
  // A card is the newest thing in the transcript, so it is the thing to scroll to.
  const tail = [...messages, ...transcript.approvals]

  // The transcript is the trigger, not a value this effect reads: it scrolls the element it
  // holds a ref to. Re-running on a content change is the whole point.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependencies are the trigger.
  useEffect(() => {
    const element = container.current
    if (element === null || !atBottom.current) return
    element.scrollTop = element.scrollHeight
  }, [tail, transcript.streaming?.blocks])

  return (
    <div
      ref={container}
      onScroll={(event) => {
        const element = event.currentTarget
        atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-6">
        {messages.map((message, index) => (
          <MessageView key={message.id} message={message} index={userIndex(messages, index)} />
        ))}
        {transcript.approvals.map((request) => (
          <ApprovalCard key={request.requestId} request={request} />
        ))}
      </div>
    </div>
  )
}
