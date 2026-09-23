import { formatCost, formatTokens, totalUsage } from '@alpha/domain'
import { Show } from 'solid-js'
import { conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { BAND, BESIDE_SCROLLS } from './ledger.ts'
import { RailToggle, WindowControls } from './TitleBar.tsx'

/**
 * The title of the page — the text voice at its title size, so the page says what it is in the
 * same voice it is written in. It takes the room that is left and truncates past its own floor.
 *
 * What the session has spent is said here and nowhere else: one tooltip on the title, the sum of
 * what the turns cost. The transcript carries no tail lines under its messages and a single
 * message's cost is not shown at all (C5.4).
 */
function ConversationTitle() {
  const t = useText()
  const totals = () => totalUsage(conversations.transcript)
  const spend = () => {
    if (totals().totalTokens === 0) return undefined
    const tokens = formatTokens(totals().totalTokens)
    const cost = formatCost(totals().cost)
    return cost === '' ? t('header.spend', { tokens }) : t('header.spendCost', { tokens, cost })
  }

  return (
    <Show when={conversations.transcript.summary}>
      {(summary) => (
        <h1
          title={spend()}
          class="min-w-24 flex-1 truncate font-text text-title font-semibold tracking-tight text-foreground"
        >
          {summary().title}
        </h1>
      )}
    </Show>
  )
}

/**
 * The view head at the top of the page: what this document is, and nothing else. One height, one
 * padding, a hairline under it — chrome that does not move, so the title stands on the same x on
 * every page and at every width, and the window's three keep the same y (C5.4). The rail's toggle
 * stands in the head's own left padding, outside the row, so it moves nothing. With a conversation
 * open this names it; with none the page is a title page and wears no head at all (a document says
 * its name once).
 *
 * A div rather than a `<header>`: the window has one banner — the masthead of the rail, with the
 * app's name — and a second element with that role would make "the header" ambiguous, to a reader
 * and to a test. The heading inside is what carries the meaning.
 */
export function DocHead() {
  return (
    <Show when={conversations.transcript.summary}>
      <div class={`${BAND} ${BESIDE_SCROLLS}`}>
        <span class="no-drag absolute top-1/2 left-0 -translate-y-1/2">
          <RailToggle />
        </span>
        <ConversationTitle />
        {/* What acts on the window is not one of the page's concerns: at the corner itself, in
            the head's own right padding — the mirror of the rail's toggle on the left. */}
        <span class="no-drag -mr-8 flex shrink-0 items-center">
          <WindowControls />
        </span>
      </div>
    </Show>
  )
}
