import { type Undef, visibleMessages } from '@alpha/domain'
import { createEffect, createMemo, Show } from 'solid-js'
import { conversations } from '../stores/conversations.ts'
import { composerFolderOf, shell } from '../stores/shell.ts'
import { Composer } from './Composer.tsx'
import { DocHead } from './DocHead.tsx'
import { EmptyState } from './EmptyState.tsx'
import { BESIDE_SCROLLS, COLUMN, SCROLLS } from './ledger.ts'
import { MessageList } from './MessageList.tsx'

/**
 * The page itself: the view head that names it, the body that scrolls, and the writing box at its
 * foot. This is the window's text — the transcript if there is one, the title page if there is not
 * (C5.4) — and everything drawn in it stands on one pair of edges.
 */
export function ConversationPane() {
  const streaming = () => conversations.transcript.status === 'running'
  const composerFolder = () => composerFolderOf(shell)
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
    <div class="flex h-full flex-col">
      <Show when={hasSummary()}>
        <DocHead />
      </Show>

      {/* The body: one scroll, the wheel's room always reserved. Sideways is never the answer: a
          wide table, a long path or a line of code that cannot break scrolls inside its own block
          or breaks, and the page's own edges do not move. */}
      <div
        ref={(element) => {
          scroller = element
        }}
        onScroll={(event) => {
          const element = event.currentTarget
          atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48
        }}
        class={`min-h-0 flex-1 overflow-x-hidden ${SCROLLS}`}
        data-region="transcript"
      >
        <div class={`flex min-h-full flex-col pt-6 pb-2 ${COLUMN}`} data-column="conversation">
          <Show when={hasMessages()} fallback={<EmptyState />}>
            <MessageList transcript={conversations.transcript} />
          </Show>
        </div>
      </div>

      {/* The writing box, docked at the foot of a conversation: the margin above it is the one line
          in the window that is lit while a turn is being written (C5.5). It stands beside the
          scroll above it, so it gives up the wheel's room on the same side (BESIDE_SCROLLS) and
          lands on the exact edge the rows end on (C5.4). A folder's title page carries its own box
          in the welcome instead — but with no folder at all the box stays here, saying a folder
          comes first. */}
      <Show when={hasMessages() || composerFolder() === undefined}>
        <div class={`w-full shrink-0 pb-4 ${BESIDE_SCROLLS}`} data-column="conversation">
          <Composer streaming={streaming()} />
        </div>
      </Show>
    </div>
  )
}
