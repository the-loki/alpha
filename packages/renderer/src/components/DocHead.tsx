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
import { useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useText } from '../stores/shell.ts'
import { DESTRUCTIVE_ACTION, TEXT_ACTION } from './controls.ts'
import { PAGE } from './ledger.ts'

/** The head's own controls are stamps, like every other control on the sheet. */
const SELECT_CLASS =
  'border border-line bg-ink-700 px-2 py-1 text-xs text-parchment-dim transition-colors hover:text-parchment focus:border-line-strong focus:outline-none'

/** What the session has spent. Cost is shown only when the model's own cost data is non-zero. */
function UsageReadout() {
  const t = useText()
  const transcript = useConversations((state) => state.transcript)
  const totals = totalUsage(transcript)
  if (totals.totalTokens === 0) return null

  return (
    <span className="shrink-0 font-mono text-micro text-parchment-faint" title={t('header.tokens')}>
      {formatTokens(totals.totalTokens)} tokens
      {formatCost(totals.cost) === '' ? '' : ` · ${formatCost(totals.cost)}`}
    </span>
  )
}

/** Exporting and deleting are things you do to a conversation, so they live with its title. */
function ConversationActions() {
  const t = useText()
  const activeId = useConversations((state) => state.activeId)
  const exportMarkdown = useConversations((state) => state.exportMarkdown)
  const remove = useConversations((state) => state.remove)
  const [written, setWritten] = useState('')

  return (
    <span className="flex shrink-0 items-center gap-3">
      {written !== '' && (
        <span className="font-mono text-micro text-jade">{t('header.exportedTo', { path: written })}</span>
      )}
      <button type="button" onClick={() => void exportMarkdown(activeId).then(setWritten)} className={TEXT_ACTION}>
        {t('header.export')}
      </button>
      <button type="button" onClick={() => void remove(activeId)} className={DESTRUCTIVE_ACTION}>
        {t('header.delete')}
      </button>
    </span>
  )
}

/** The title of the page and the quiet facts about it, told apart by a middot. */
function ConversationTitle() {
  const summary = useConversations((state) => state.transcript.summary)
  const t = useText()
  if (summary === undefined) return null

  return (
    <span className="flex min-w-0 items-baseline gap-3">
      <h1 className="min-w-0 truncate font-display text-xl font-medium text-parchment">{summary.title}</h1>
      <span className="shrink-0 font-mono text-micro text-parchment-faint" title={summary.workspacePath}>
        {folderName(summary.workspacePath)}
      </span>
      <span className="shrink-0 font-mono text-micro text-parchment-faint" aria-hidden="true">
        ·
      </span>
      <span className="shrink-0 font-mono text-micro text-parchment-faint">
        {t('header.updated', { age: formatAge(summary.updatedAt, Date.now()) })}
      </span>
    </span>
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
  const summary = useConversations((state) => state.transcript.summary)
  const t = useText()
  const setThinkingLevel = useConversations((state) => state.setThinkingLevel)

  const band = `flex h-14 items-center justify-between gap-4 border-b border-line/70 bg-ink-800/70 backdrop-blur-xl ${PAGE}`

  // A page that has not been asked anything yet has no head band: its name is set on the page
  // itself, large, where a title page puts it — and a document says its name once (ADR-0019).
  if (summary === undefined) return null

  return (
    <div className={band}>
      <ConversationTitle />
      <div className="flex shrink-0 items-center gap-3">
        <UsageReadout />
        <ConversationActions />
        {/* What this conversation is, and how hard it should think: told apart by a rule rather
            than by a row of controls of equal weight. Which model it runs on is chosen at the foot
            of the composer, next to the message that will use it. */}
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <select
          aria-label={t('header.thinking')}
          value={summary.thinkingLevel}
          onChange={(event) => void setThinkingLevel(event.target.value as ThinkingLevel)}
          className={SELECT_CLASS}
        >
          {THINKING_LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(thinkingKey(level))}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
