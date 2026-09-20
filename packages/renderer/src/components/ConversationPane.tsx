import { Show } from 'solid-js'
import { conversations } from '../stores/conversations.ts'
import { Composer } from './Composer.tsx'
import { DocHead } from './DocHead.tsx'
import { EmptyState } from './EmptyState.tsx'
import { MessageList } from './MessageList.tsx'

/**
 * The middle column: the transcript if there is one, the next action if there is not.
 *
 * The head and the composer float over the page as glass — the transcript slides beneath them —
 * and the hearth under the composer is where the room's light comes from: it brightens while the
 * agent works and settles when it is done, which is the one thing in the window that is alive
 * (C5.4, C5.6).
 */
export function ConversationPane() {
  const streaming = () => conversations.transcript.status === 'running'
  const hasSummary = () => conversations.transcript.summary !== undefined
  const hasMessages = () =>
    conversations.transcript.messages.length > 0 || conversations.transcript.streaming !== undefined

  return (
    <div class="relative flex h-full flex-col">
      {/* The hearth: the agent's own light, pooled at the foot of the page. It is decoration and
          nothing else, so it cannot be touched or read, and it dims to embers at rest. */}
      <div
        aria-hidden="true"
        class={`pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-accent/15 blur-3xl transition-opacity duration-1000 ${
          streaming() ? 'opacity-100' : 'opacity-40'
        }`}
      />

      <Show when={hasSummary()}>
        <div class="absolute inset-x-0 top-0 z-20">
          <DocHead />
        </div>
      </Show>

      {/* A flex column, so the transcript inside it fills the page and slides under the glass of
          the head above and the composer below. */}
      <div class={`flex min-h-0 flex-1 flex-col ${hasSummary() ? 'pt-14' : ''}`}>
        <Show when={hasMessages()} fallback={<EmptyState />}>
          <MessageList transcript={conversations.transcript} />
        </Show>
      </div>

      <Composer streaming={streaming()} />
    </div>
  )
}
