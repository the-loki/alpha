import { type Undef, visibleMessages } from '@alpha/core'
import { createEffect, createMemo, Show } from 'solid-js'
import { conversations } from '../stores/conversations.ts'
import { Composer } from './Composer.tsx'
import { DocHead } from './DocHead.tsx'
import { EmptyState } from './EmptyState.tsx'
import { COLUMN, SCROLLS } from './ledger.ts'
import { MessageList } from './MessageList.tsx'

/**
 * The middle column: the transcript if there is one, the next action if there is not.
 *
 * The page is one scroll. The band that names it and the bar the next message is written in are
 * both inside that scroll — the band pinned to its top, the bar docked at its foot — so the
 * transcript slides under both and the page keeps the whole height of the window instead of
 * spending a strip at each end on chrome that never moves. Everything drawn in it stands on one
 * column (C5.4, ADR-0024).
 *
 * The hearth under the bar is where the room's light comes from: it brightens while the agent
 * works and settles when it is done, which is the one thing in the window that is alive.
 */
export function ConversationPane() {
  const streaming = () => conversations.transcript.status === 'running'
  const hasSummary = () => conversations.transcript.summary !== undefined
  const hasMessages = () =>
    conversations.transcript.messages.length > 0 || conversations.transcript.streaming !== undefined

  let scroller: Undef<HTMLDivElement>
  let atBottom = true
  // The two things that make the transcript longer, watched so the scroll can follow them: what has
  // been said, and the blocks of the answer still arriving.
  const rows = createMemo(
    () => visibleMessages(conversations.transcript).length + conversations.transcript.approvals.length,
  )
  const streamed = createMemo(() => conversations.transcript.streaming?.blocks.length ?? 0)

  // It sticks to the bottom while the reader is already there, and stops the moment they scroll up:
  // reading back through a long answer should not be yanked away by the next delta.
  createEffect(() => {
    const said = rows()
    const arriving = streamed()
    const element = scroller
    if (element === undefined || !atBottom || (said === 0 && arriving === 0)) return
    element.scrollTop = element.scrollHeight
  })

  return (
    // The pane is a query container: how much room the band's quiet facts have is a question about
    // the pane beside the rail, not about the window (C5.3).
    <div class="@container/conversation relative flex h-full flex-col">
      {/* The hearth: the agent's own light, pooled at the foot of the page. It is decoration and
          nothing else, so it cannot be touched or read, and it dims to embers at rest. */}
      <div
        aria-hidden="true"
        class={`pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-accent/15 blur-3xl transition-opacity duration-1000 ${
          streaming() ? 'opacity-100' : 'opacity-40'
        }`}
      />

      <div
        ref={(element) => {
          scroller = element
        }}
        onScroll={(event) => {
          const element = event.currentTarget
          atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48
        }}
        // Sideways is never the answer: a wide table, a long path or a line of code that cannot
        // break scrolls inside its own block or breaks, and the column's own edges do not move.
        class={`min-h-0 flex-1 overflow-x-hidden ${SCROLLS}`}
        data-region="transcript"
      >
        <div class="flex min-h-full flex-col">
          <Show when={hasSummary()}>
            <DocHead />
          </Show>

          <div class={`flex-1 pt-6 pb-2 ${COLUMN}`} data-column="conversation">
            <Show when={hasMessages()} fallback={<EmptyState />}>
              <MessageList transcript={conversations.transcript} />
            </Show>
          </div>

          <Composer streaming={streaming()} />
        </div>
      </div>
    </div>
  )
}
