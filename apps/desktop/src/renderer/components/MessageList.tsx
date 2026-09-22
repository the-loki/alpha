import {
  formatCost,
  formatTokens,
  type TranscriptState,
  type TurnUsage,
  type Undef,
  visibleMessages,
} from '@alpha/core'
import { createMemo, Index, Show } from 'solid-js'
import { useText } from '../stores/shell.ts'
import { ApprovalCard } from './ApprovalCard.tsx'
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
 * The rows of the transcript. The scroll they live in, and following it, belong to the page (the
 * band above them and the bar below them are in that scroll too).
 *
 * Each row is drawn by position rather than by identity, because a streaming answer replaces whole
 * messages as it grows: a row that was rebuilt on every delta would lose what it was holding — an
 * expanded tool line, an open edit box — every time a token arrived.
 */
export function MessageList(props: { transcript: TranscriptState }) {
  const messages = createMemo(() => visibleMessages(props.transcript))

  return (
    // The reader's words sit in a bubble set to the right, and the work that answers them —
    // thinking, tool calls, the answer — stands on the column itself. The column is the reading
    // measure: prose, code, tables and tool lines all start and end on its edges (C5.3, C5.4).
    <div class="flex flex-col">
      <Index each={messages()}>
        {(message, index) => (
          // A turn opens with the reader's own words and everything after it is the work done
          // for them, so the gap inside a turn is smaller than the gap between two of them.
          <div class={index === 0 ? '' : message().role === 'user' ? 'mt-9' : 'mt-4'}>
            <MessageView
              message={message()}
              index={userIndex(messages(), index)}
              last={index === messages().length - 1}
            />
            <TurnUsageNote turn={turnFor(messages(), index, props.transcript.turns)} />
          </div>
        )}
      </Index>
      <Index each={props.transcript.approvals}>
        {(request) => (
          <div class="mt-4">
            <ApprovalCard request={request()} />
          </div>
        )}
      </Index>
    </div>
  )
}
