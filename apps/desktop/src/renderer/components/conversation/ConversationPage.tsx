import { type Undef, visibleMessages } from '@alpha/domain'
import { createEffect, createMemo, createSignal, Match, Show, Switch } from 'solid-js'
import { BESIDE_SCROLLS, COLUMN, SCROLLS } from '../../lib/ledger.ts'
import { conversationActions, conversations } from '../../stores/conversations.ts'
import { composerFolderOf, shell, useText } from '../../stores/shell.ts'
import { DocHead } from '../chrome/DocHead.tsx'
import { WindowCorner } from '../chrome/WindowCorner.tsx'
import { PRIMARY_ACTION } from '../controls.ts'
import { Composer } from './Composer.tsx'
import { ConversationTabs, type ConversationView } from './ConversationTabs.tsx'
import { EmptyState } from './EmptyState.tsx'
import { McpActivityView } from './McpActivityView.tsx'
import { MessageList } from './MessageList.tsx'
import { WorkspaceChangesView } from './WorkspaceChangesView.tsx'

function ConversationOpening() {
  const t = useText()
  return (
    <div class="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <WindowCorner />
      <Show
        when={conversations.openFailure}
        fallback={
          <p role="status" class="font-text text-body text-muted">
            {t('conversation.opening')}
          </p>
        }
      >
        {(failure) => (
          <>
            <p role="alert" class="font-text text-body text-foreground">
              {t('conversation.openFailed')}
            </p>
            <p class="max-w-measure font-text text-name text-muted">{failure()}</p>
            <button
              type="button"
              class={PRIMARY_ACTION}
              onClick={() => void conversationActions.open(conversations.activeId)}
            >
              {t('conversation.retry')}
            </button>
          </>
        )}
      </Show>
    </div>
  )
}

/**
 * The page itself: the view head that names it, the body that scrolls, and the writing box at its
 * foot. This is the window's text — the transcript if there is one, the title page if there is not
 * (C5.4) — and everything drawn in it stands on one pair of edges.
 */
export function ConversationPage() {
  const [view, setView] = createSignal<ConversationView>('conversation')
  const streaming = () => conversations.transcript.status === 'running'
  const composerFolder = () => composerFolderOf(shell)
  const hasSummary = () => conversations.transcript.summary !== undefined
  const awaitingConversation = () => conversations.activeId !== '' && !hasSummary()
  const hasMessages = () =>
    conversations.transcript.messages.length > 0 ||
    conversations.transcript.streaming !== undefined ||
    conversations.transcript.mcpPending.length > 0 ||
    conversations.transcript.mcpSamplingPending.length > 0

  createEffect(() => {
    conversations.activeId
    setView('conversation')
  })

  createEffect(() => {
    if (conversations.transcript.mcpPending.length > 0 || conversations.transcript.mcpSamplingPending.length > 0)
      setView('conversation')
  })

  let scroller: Undef<HTMLDivElement>
  let atBottom = true
  // The two things that make the transcript longer, watched so the scroll can follow them: what has
  // been said, and the blocks of the answer still arriving.
  const rows = createMemo(
    () =>
      visibleMessages(conversations.transcript).length +
      conversations.transcript.approvals.length +
      conversations.transcript.mcpPending.length +
      conversations.transcript.mcpSamplingPending.length,
  )
  const streamed = createMemo(() => conversations.transcript.streaming?.blocks.length ?? 0)
  const samplingStage = createMemo(() =>
    conversations.transcript.mcpSamplingPending.map((request) => request.stage).join(','),
  )

  // It sticks to the bottom while the reader is already there, and stops the moment they scroll up:
  // reading back through a long answer should not be yanked away by the next delta.
  createEffect(() => {
    const said = rows()
    const arriving = streamed()
    samplingStage()
    const element = scroller
    if (element === undefined || !atBottom || (said === 0 && arriving === 0)) return
    element.scrollTop = element.scrollHeight
  })

  return (
    <div class="flex h-full flex-col">
      <Show when={awaitingConversation()}>
        <ConversationOpening />
      </Show>
      <Show when={!awaitingConversation()}>
        <Show when={hasSummary()}>
          <DocHead />
          <ConversationTabs
            view={view}
            onViewChange={setView}
            hasMcp={conversations.transcript.mcpExchanges.length > 0}
          />
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
            <Switch>
              <Match when={view() === 'conversation'}>
                <Show when={hasSummary()} fallback={<EmptyState />}>
                  <div role="tabpanel" id="conversation-view" aria-labelledby="conversation-view-tab">
                    <Show when={hasMessages()} fallback={<EmptyState />}>
                      <MessageList transcript={conversations.transcript} />
                    </Show>
                  </div>
                </Show>
              </Match>
              <Match when={view() === 'changes'}>
                <WorkspaceChangesView changeSets={conversations.transcript.workspaceChanges} />
              </Match>
              <Match when={view() === 'mcp'}>
                <McpActivityView exchanges={conversations.transcript.mcpExchanges} />
              </Match>
            </Switch>
          </div>
        </div>

        {/* The writing box, docked at the foot of a conversation: the margin above it is the one line
          in the window that is lit while a turn is being written (C5.5). It stands beside the
          scroll above it, so it gives up the wheel's room on the same side (BESIDE_SCROLLS) and
          lands on the exact edge the rows end on (C5.4). A folder's title page carries its own box
          in the welcome instead — but with no folder at all the box stays here, saying a folder
          comes first. */}
        <Show when={view() !== 'conversation' || hasMessages() || composerFolder() === undefined}>
          <div class={`w-full shrink-0 pb-4 ${BESIDE_SCROLLS}`} data-column="conversation">
            <Composer streaming={streaming()} />
          </div>
        </Show>
      </Show>
    </div>
  )
}
