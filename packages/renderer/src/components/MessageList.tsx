import {
  formatCost,
  formatTokens,
  type Null,
  type TranscriptState,
  type TurnUsage,
  type Undef,
  visibleMessages,
} from '@alpha/core'
import { Fragment, useEffect, useRef } from 'react'
import { useText } from '../stores/shell.ts'
import { ApprovalCard } from './ApprovalCard.tsx'
import { PAGE, PAGE_RULE } from './ledger.ts'
import { MessageView } from './MessageView.tsx'

/** Which user message this is, counting from the top, which is how an edit names its target. */
const userIndex = (messages: { role: string }[], index: number): number =>
  messages.slice(0, index + 1).filter((message) => message.role === 'user').length - 1

/**
 * The usage row belongs to the end of a turn, so it is drawn under the last message of the turn —
 * which is the last assistant message before the next user message.
 */
const turnFor = (messages: { role: string }[], index: number, turns: TurnUsage[]): Undef<TurnUsage> => {
  const isLastOfTurn = messages[index]?.role === 'assistant' && messages[index + 1]?.role !== 'assistant'
  if (!isLastOfTurn) return undefined
  const finished = messages.slice(0, index + 1).filter((message) => message.role === 'user').length - 1
  return turns[finished]
}

/** What one turn spent, so the header's total can be read back to the turns that made it. */
function TurnUsageNote({ turn }: { turn: Undef<TurnUsage> }) {
  const t = useText()
  if (turn === undefined) return null
  const cost = formatCost(turn.usage.cost)
  const tokens = formatTokens(turn.usage.totalTokens)
  const earlier = turn.earlier === true

  return (
    // The turn's closing edge: a rule the width of the ledger, with what the turn spent at its
    // right end. It is what makes a long transcript read as turns rather than as one run of text.
    <div className="mt-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="font-mono text-micro text-parchment-faint">
        {t(NOTE[cost === '' ? (earlier ? 'earlier' : 'turn') : earlier ? 'earlierCost' : 'turnCost'], { tokens, cost })}
      </span>
    </div>
  )
}

/** Which of the four lines a turn note can be: with or without a cost, first or earlier. */
const NOTE = {
  turn: 'message.turn',
  earlier: 'message.turnEarlier',
  turnCost: 'message.turnCost',
  earlierCost: 'message.turnEarlierCost',
} as const

/**
 * The transcript. It sticks to the bottom while the reader is already there, and stops sticking
 * the moment they scroll up: reading back through a long answer should not be yanked away by the
 * next delta.
 */
export function MessageList({ transcript }: { transcript: TranscriptState }) {
  const container = useRef<Null<HTMLDivElement>>(null)
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
      data-region="transcript"
    >
      {/* The page: a ruled margin, then the text block. Tool rows, diffs and code take the width
          of the block, and prose carries its own reading measure (C5.3) rather than the column
          being centred and narrow. `min-h-full` is what makes the margin rule run to the foot of
          the page even when the turns only fill the top of it. */}
      <div className={`min-h-full py-6 ${PAGE}`}>
        <div className={`min-h-full ${PAGE_RULE} flex flex-col`}>
          {messages.map((message, index) => (
            // A turn opens with the reader's own words and everything after it is the work done
            // for them, so the gap inside a turn is smaller than the gap between two of them.
            <Fragment key={message.id}>
              <div className={index === 0 ? '' : message.role === 'user' ? 'mt-10' : 'mt-4'}>
                <MessageView
                  message={message}
                  index={userIndex(messages, index)}
                  last={index === messages.length - 1}
                />
                <TurnUsageNote turn={turnFor(messages, index, transcript.turns)} />
              </div>
            </Fragment>
          ))}
          {transcript.approvals.map((request) => (
            <div key={request.requestId} className="mt-4">
              <ApprovalCard request={request} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
