import {
  type Absent,
  formatCost,
  formatTokens,
  type TranscriptState,
  type TurnUsage,
  visibleMessages,
} from '@alpha/core'
import { Fragment, useEffect, useRef } from 'react'
import { ApprovalCard } from './ApprovalCard.tsx'
import { MessageView } from './MessageView.tsx'

/** Which user message this is, counting from the top, which is how an edit names its target. */
const userIndex = (messages: { role: string }[], index: number): number =>
  messages.slice(0, index + 1).filter((message) => message.role === 'user').length - 1

/**
 * The usage row belongs to the end of a turn, so it is drawn under the last message of the turn —
 * which is the last assistant message before the next user message.
 */
const turnFor = (messages: { role: string }[], index: number, turns: TurnUsage[]): Absent<TurnUsage> => {
  const isLastOfTurn = messages[index]?.role === 'assistant' && messages[index + 1]?.role !== 'assistant'
  if (!isLastOfTurn) return undefined
  const finished = messages.slice(0, index + 1).filter((message) => message.role === 'user').length - 1
  return turns[finished]
}

/** What one turn spent, so the header's total can be read back to the turns that made it. */
function TurnUsageNote({ turn }: { turn: Absent<TurnUsage> }) {
  if (turn === undefined) return null
  const cost = formatCost(turn.usage.cost)

  return (
    <p className="mt-1 font-mono text-micro text-parchment-faint">
      {turn.earlier === true ? 'Earlier turns · ' : 'Turn · '}
      {formatTokens(turn.usage.totalTokens)} tokens{cost === '' ? '' : ` · ${cost}`}
    </p>
  )
}

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
      {/* Full pane width: tool rows, diffs and code get the room, and prose carries its own
          reading measure (C5.3) rather than the column being centred and narrow. */}
      <div className="flex w-full flex-col gap-6 px-8 py-6">
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            <MessageView message={message} index={userIndex(messages, index)} last={index === messages.length - 1} />
            <TurnUsageNote turn={turnFor(messages, index, transcript.turns)} />
          </Fragment>
        ))}
        {transcript.approvals.map((request) => (
          <ApprovalCard key={request.requestId} request={request} />
        ))}
      </div>
    </div>
  )
}
