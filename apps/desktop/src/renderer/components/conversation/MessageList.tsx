import { type TranscriptState, visibleMessages } from '@alpha/domain'
import { createMemo, Index } from 'solid-js'
import { useText } from '../../stores/shell.ts'
import { ApprovalCard } from './ApprovalCard.tsx'
import { ElicitationCard } from './ElicitationCard.tsx'
import { MessageView } from './MessageView.tsx'

/** Which user message this is, counting from the top, which is how an edit names its target. */
const userIndex = (messages: { role: string }[], index: number): number =>
  messages.slice(0, index + 1).filter((message) => message.role === 'user').length - 1

/**
 * The rows of the transcript. The scroll they live in, and following it, belong to the page.
 *
 * Each row is drawn by position rather than by identity, because a streaming answer replaces whole
 * messages as it grows: a row that was rebuilt on every delta would lose what it was holding — an
 * expanded tool line, an open edit box — every time a token arrived.
 */
export function MessageList(props: { transcript: TranscriptState }) {
  const messages = createMemo(() => visibleMessages(props.transcript))
  const t = useText()

  return (
    // The reader's words come in as a slip laid in a well, and the work that answers them —
    // thinking, tool calls, the answer — is written on the page itself, in the text voice. The
    // page fills the window: prose, code, tables and tool lines all start and end on its edges.
    // It is the conversation, named so it can be found: not the whole page — the composer and its
    // rows for what waits are not part of it — and not a live region, which is what `role="log"`
    // would make of it: a screen reader would read every delta and every card out as it appeared.
    <section aria-label={t('message.transcript')} class="flex flex-col">
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
      <Index each={props.transcript.mcpPending}>
        {(request) => (
          <div class="mt-4">
            <ElicitationCard request={request()} />
          </div>
        )}
      </Index>
    </section>
  )
}
