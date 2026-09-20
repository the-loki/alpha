import {
  folderName,
  formatAge,
  formatCost,
  formatTokens,
  THINKING_LEVELS,
  type ThinkingLevel,
  thinkingKey,
  totalUsage,
} from '@alpha/core'
import { createSignal, For, Show } from 'solid-js'
import { conversationActions, conversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { DESTRUCTIVE_ACTION, TEXT_ACTION } from './controls.ts'
import { PAGE } from './ledger.ts'

/** The head's own controls are stamps, like every other control on the sheet. */
const SELECT_CLASS =
  'border border-line bg-ink-700 px-2 py-1 text-xs text-parchment-dim transition-colors hover:text-parchment focus:border-line-strong focus:outline-none'

/** What the session has spent. Cost is shown only when the model's own cost data is non-zero. */
function UsageReadout() {
  const t = useText()
  const totals = () => totalUsage(conversations.transcript)

  return (
    <Show when={totals().totalTokens !== 0}>
      <span class="shrink-0 font-mono text-micro text-parchment-faint" title={t('header.tokens')}>
        {formatTokens(totals().totalTokens)} tokens
        {formatCost(totals().cost) === '' ? '' : ` · ${formatCost(totals().cost)}`}
      </span>
    </Show>
  )
}

/** Exporting and deleting are things you do to a conversation, so they live with its title. */
function ConversationActions() {
  const t = useText()
  const [written, setWritten] = createSignal('')

  return (
    <span class="flex shrink-0 items-center gap-3">
      <Show when={written() !== ''}>
        <span class="font-mono text-micro text-jade">{t('header.exportedTo', { path: written() })}</span>
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

/** The title of the page and the quiet facts about it, told apart by a middot. */
function ConversationTitle() {
  const t = useText()

  return (
    <Show when={conversations.transcript.summary}>
      {(summary) => (
        <span class="flex min-w-0 items-baseline gap-3">
          <h1 class="min-w-0 truncate font-display text-xl font-medium text-parchment">{summary().title}</h1>
          <span class="shrink-0 font-mono text-micro text-parchment-faint" title={summary().workspacePath}>
            {folderName(summary().workspacePath)}
          </span>
          <span class="shrink-0 font-mono text-micro text-parchment-faint" aria-hidden="true">
            ·
          </span>
          <span class="shrink-0 font-mono text-micro text-parchment-faint">
            {t('header.updated', { age: formatAge(summary().updatedAt, Date.now()) })}
          </span>
        </span>
      )}
    </Show>
  )
}

/**
 * The head of the page, at the top of it: what this document is, and nothing else. With a
 * conversation open that is its title and what it has spent; with none it is the folder the next
 * message will land in, because a page about to be written still says what it is about.
 *
 * A div rather than a `<header>`: the window has one banner — the strip with the app's mark and
 * the window controls — and a second element with that role would make "the header" ambiguous,
 * to a reader and to a test. The heading inside is what carries the meaning.
 */
export function DocHead() {
  const t = useText()

  const band = `flex h-14 items-center justify-between gap-4 border-b border-line/70 bg-ink-800/70 backdrop-blur-xl ${PAGE}`

  // A page that has not been asked anything yet has no head band: its name is set on the page
  // itself, large, where a title page puts it — and a document says its name once (ADR-0019).
  return (
    <Show when={conversations.transcript.summary}>
      {(summary) => (
        <div class={band}>
          <ConversationTitle />
          <div class="flex shrink-0 items-center gap-3">
            <UsageReadout />
            <ConversationActions />
            {/* What this conversation is, and how hard it should think: told apart by a rule rather
                than by a row of controls of equal weight. Which model it runs on is chosen at the foot
                of the composer, next to the message that will use it. */}
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
        </div>
      )}
    </Show>
  )
}
