import { formatCost, formatTokens, THINKING_LEVELS, type ThinkingLevel, thinkingKey, totalUsage } from '@alpha/core'
import { createSignal, For, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { CONTROL_HEIGHT, DESTRUCTIVE_ACTION, FIELD_FRAME, TEXT_ACTION } from './controls.ts'
import { BAND, BESIDE_SCROLLS } from './ledger.ts'
import { RailToggle, WindowControls } from './TitleBar.tsx'

/**
 * The view head's own control: the same body as every other control in the window — one height,
 * one hairline — set in the apparatus voice, because it is a measurement the turn is made under.
 */
const SELECT_CLASS = `${CONTROL_HEIGHT} px-2 font-mono text-label text-muted transition-colors hover:text-foreground ${FIELD_FRAME}`

/** Exporting and deleting are things you do to a conversation, so they live with its title. */
function ConversationActions() {
  const t = useText()
  const [written, setWritten] = createSignal('')

  return (
    <span class="flex shrink-0 items-center gap-3">
      <Show when={written() !== ''}>
        <span class="font-mono text-label text-success">{t('header.exportedTo', { path: written() })}</span>
      </Show>
      <button
        type="button"
        onClick={() => void conversationActions.exportMarkdown(conversations.activeId).then(setWritten)}
        class={TEXT_ACTION}
      >
        {t('header.export')}
      </button>
      <button
        type="button"
        onClick={() => void conversationActions.remove(conversations.activeId)}
        class={DESTRUCTIVE_ACTION}
      >
        {t('header.delete')}
      </button>
    </span>
  )
}

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
  const t = useText()

  return (
    <Show when={conversations.transcript.summary}>
      {(summary) => (
        <div class={`${BAND} ${BESIDE_SCROLLS}`}>
          <span class="no-drag absolute top-1/2 left-0 -translate-y-1/2">
            <RailToggle />
          </span>
          <ConversationTitle />
          <div class="no-drag flex shrink-0 items-center gap-3">
            <ConversationActions />
            {/* How hard this conversation should think: told apart by a rule rather than by a row
                of controls of equal weight. Which model it runs on is chosen at the foot of the
                composer, next to the message that will use it. */}
            <span class="h-4 w-px bg-line" aria-hidden="true" />
            <select
              aria-label={t('header.thinking')}
              value={summary().thinkingLevel}
              onInput={(event) => void conversationActions.setThinkingLevel(event.currentTarget.value as ThinkingLevel)}
              class={SELECT_CLASS}
            >
              <For each={THINKING_LEVELS}>{(level) => <option value={level}>{t(thinkingKey(level))}</option>}</For>
            </select>
          </div>
          {/* What acts on the window is not one of the page's concerns: past a rule, at the corner. */}
          <span class="no-drag flex shrink-0 items-center gap-4">
            <span class="h-4 w-px bg-line" aria-hidden="true" />
            <WindowControls />
          </span>
        </div>
      )}
    </Show>
  )
}
