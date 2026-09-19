import {
  folderName,
  formatAge,
  formatCost,
  formatTokens,
  THINKING_LEVELS,
  type ThinkingLevel,
  thinkingLabel,
  totalUsage,
} from '@alpha/core'
import { useEffect, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useProviders } from '../stores/providers.ts'
import { DESTRUCTIVE_ACTION, TEXT_ACTION } from './controls.ts'

/** The two choices in the header are controls, and they read as controls rather than as text. */
const SELECT_CLASS =
  'rounded-control border border-line bg-ink-800 px-2 py-1 text-xs text-parchment-dim transition-colors hover:text-parchment focus:border-line-strong focus:outline-none'

/** What the session has spent. Cost is shown only when the model's own cost data is non-zero. */
function UsageReadout() {
  const transcript = useConversations((state) => state.transcript)
  const totals = totalUsage(transcript)
  if (totals.totalTokens === 0) return null

  return (
    <span className="shrink-0 font-mono text-micro text-parchment-faint" title="Tokens and cost for this conversation">
      {formatTokens(totals.totalTokens)} tokens
      {formatCost(totals.cost) === '' ? '' : ` · ${formatCost(totals.cost)}`}
    </span>
  )
}

/** Exporting and deleting are things you do to a conversation, so they live with its title. */
function ConversationActions() {
  const activeId = useConversations((state) => state.activeId)
  const exportMarkdown = useConversations((state) => state.exportMarkdown)
  const remove = useConversations((state) => state.remove)
  const [written, setWritten] = useState('')

  return (
    <span className="flex shrink-0 items-center gap-3">
      {written !== '' && <span className="font-mono text-micro text-jade">Exported to {written}</span>}
      <button type="button" onClick={() => void exportMarkdown(activeId).then(setWritten)} className={TEXT_ACTION}>
        Export
      </button>
      <button type="button" onClick={() => void remove(activeId)} className={DESTRUCTIVE_ACTION}>
        Delete
      </button>
    </span>
  )
}

/**
 * What this conversation runs on. Both choices are per conversation — a throwaway question can
 * be cheap and a hard one expensive — and both take effect on the next turn.
 */
export function ConversationHeader() {
  const summary = useConversations((state) => state.transcript.summary)
  const setModel = useConversations((state) => state.setModel)
  const setThinkingLevel = useConversations((state) => state.setThinkingLevel)
  const snapshot = useProviders((state) => state.snapshot)
  const models = useProviders((state) => state.models)
  const loadModels = useProviders((state) => state.loadModels)

  useEffect(() => {
    for (const provider of snapshot.providers) {
      if (models[provider.id] === undefined) void loadModels(provider.id)
    }
  }, [snapshot.providers, models, loadModels])

  if (summary === undefined) return null
  const chosen = `${summary.model.providerId}::${summary.model.modelId}`

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-8 py-2">
      {/* Which folder this conversation belongs to is part of what it is, now that several are in
          play at once; the sidebar shows the same name. Its age is here rather than in the sidebar,
          where the row belongs to the name. */}
      <span className="flex min-w-0 items-baseline gap-2">
        <h1 className="min-w-0 truncate text-ui font-medium text-parchment">{summary.title}</h1>
        <span className="shrink-0 font-mono text-micro text-parchment-faint" title={summary.workspacePath}>
          {folderName(summary.workspacePath)}
        </span>
        <span className="shrink-0 font-mono text-micro text-parchment-faint">
          updated {formatAge(summary.updatedAt, Date.now())}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-3">
        <UsageReadout />
        <ConversationActions />
        {/* What this conversation is, and what it runs on: two groups, told apart by a rule rather
            than by five controls of equal weight sitting in a row. */}
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <select
          aria-label="Model"
          value={chosen}
          onChange={(event) => {
            const [providerId, modelId] = event.target.value.split('::')
            void setModel(providerId, modelId)
          }}
          className={`max-w-[22rem] ${SELECT_CLASS}`}
        >
          {snapshot.providers.length === 0 && <option value="">No provider configured</option>}
          {snapshot.providers.map((provider) => (
            <optgroup key={provider.id} label={provider.name}>
              {(models[provider.id] ?? []).map((model) => (
                <option key={model.id} value={`${provider.id}::${model.id}`}>
                  {model.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          aria-label="Thinking effort"
          value={summary.thinkingLevel}
          onChange={(event) => void setThinkingLevel(event.target.value as ThinkingLevel)}
          className={SELECT_CLASS}
        >
          {THINKING_LEVELS.map((level) => (
            <option key={level} value={level}>
              {thinkingLabel(level)}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
}
