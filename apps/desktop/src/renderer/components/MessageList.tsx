import {
  formatCost,
  formatTokens,
  type TranscriptState,
  type TurnUsage,
  type Undef,
  visibleMessages,
} from '@alpha/core'
import { createEffect, createMemo, Index, Show } from 'solid-js'
import { useText } from '../stores/shell.ts'
import { ApprovalCard } from './ApprovalCard.tsx'
import { BLOCK, entryNumber, MARK_COLUMN, PAGE, SCROLLS } from './ledger.ts'
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
function TurnUsageNote(props: { turn: Undef<TurnUsage> }) {
  const t = useText()
  const cost = () => (props.turn === undefined ? '' : formatCost(props.turn.usage.cost))
  const tokens = () => (props.turn === undefined ? '' : formatTokens(props.turn.usage.totalTokens))

  return (
    <Show when={props.turn}>
      {(turn) => (
        // The turn's closing edge: a rule the width of the ledger, with what the turn spent at its
        // right end. It is what makes a long transcript read as turns rather than as one run of text.
        <div class="mt-3 flex items-center gap-3">
          <span class="h-px flex-1 bg-line" aria-hidden="true" />
          <span class="font-mono text-micro text-parchment-faint">
            {t(
              NOTE[
                cost() === ''
                  ? turn().earlier === true
                    ? 'earlier'
                    : 'turn'
                  : turn().earlier === true
                    ? 'earlierCost'
                    : 'turnCost'
              ],
              {
                tokens: tokens(),
                cost: cost(),
              },
            )}
          </span>
        </div>
      )}
    </Show>
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
 *
 * Each row is drawn by position rather than by identity, because a streaming answer replaces whole
 * messages as it grows: a row that was rebuilt on every delta would lose what it was holding — an
 * expanded ledger row, an open edit box — every time a token arrived.
 */
export function MessageList(props: { transcript: TranscriptState }) {
  let container: Undef<HTMLDivElement>
  let atBottom = true
  const messages = createMemo(() => visibleMessages(props.transcript))
  // A card is the newest thing in the transcript, so it is the thing to scroll to.
  const tail = createMemo(() => [...messages(), ...props.transcript.approvals])
  const streamed = createMemo(() => props.transcript.streaming?.blocks.length ?? 0)

  createEffect(() => {
    // The transcript is the trigger, not a value this effect reads: it scrolls the element it
    // holds, and re-running on a content change is the whole point.
    const content = tail().length
    const arriving = streamed()
    const element = container
    if (element === undefined || !atBottom || (content === 0 && arriving === 0)) return
    element.scrollTop = element.scrollHeight
  })

  return (
    <div
      ref={(element) => {
        container = element
      }}
      onScroll={(event) => {
        const element = event.currentTarget
        atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48
      }}
      class={`min-h-0 flex-1 ${SCROLLS}`}
      data-region="transcript"
    >
      {/* The page: a leading column carrying the entries' numbers, then the text block. Tool rows,
          diffs and code take the width of the block, and prose carries its own reading measure
          (C5.3) rather than the column being centred and narrow. */}
      <div class={`py-6 ${PAGE}`}>
        <div class="flex flex-col">
          <Index each={messages()}>
            {(message, index) => (
              // A turn opens with the reader's own words and everything after it is the work done
              // for them, so the gap inside a turn is smaller than the gap between two of them.
              <div class={`${BLOCK} ${index === 0 ? '' : message().role === 'user' ? 'mt-9' : 'mt-4'}`}>
                {/* Only an entry is numbered: the work that answers it hangs under the same empty
                    column, which is what keeps every line of the page starting at the same x. */}
                <span class={MARK_COLUMN} aria-hidden="true">
                  {message().role === 'user' ? entryNumber(userIndex(messages(), index)) : ''}
                </span>
                <div class="min-w-0 flex-1">
                  <MessageView
                    message={message()}
                    index={userIndex(messages(), index)}
                    last={index === messages().length - 1}
                  />
                  <TurnUsageNote turn={turnFor(messages(), index, props.transcript.turns)} />
                </div>
              </div>
            )}
          </Index>
          <Index each={props.transcript.approvals}>
            {(request) => (
              <div class={`${BLOCK} mt-4`}>
                <span class={MARK_COLUMN} aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <ApprovalCard request={request()} />
                </div>
              </div>
            )}
          </Index>
        </div>
      </div>
    </div>
  )
}
