import { formatCost, formatTokens, THINKING_LEVELS, type ThinkingLevel, thinkingLabel, totalUsage } from '@alpha/core'
import { useEffect, useState } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useProviders } from '../stores/providers.ts'

/** What the session has spent. Cost is shown only when the model's own cost data is non-zero. */
function UsageReadout() {
  const transcript = useConversations((state) => state.transcript)
  const totals = totalUsage(transcript)
  if (totals.totalTokens === 0) return null

  return (
    <span className="shrink-0 font-mono text-[11px] text-parchment-faint" title="Tokens and cost for this conversation">
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
    <span className="flex shrink-0 items-center gap-2">
      {written !== '' && <span className="font-mono text-[11px] text-jade">Exported to {written}</span>}
      <button
        type="button"
        onClick={() => void exportMarkdown(activeId).then(setWritten)}
        className="font-mono text-[11px] text-parchment-faint transition-colors hover:text-parchment"
      >
        Export
      </button>
      <button
        type="button"
        onClick={() => void remove(activeId)}
        className="font-mono text-[11px] text-parchment-faint transition-colors hover:text-danger"
      >
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
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-2">
      <h1 className="min-w-0 truncate text-[13px] font-medium text-parchment">{summary.title}</h1>
      <div className="flex items-center gap-2">
        <UsageReadout />
        <ConversationActions />
        <select
          aria-label="Model"
          value={chosen}
          onChange={(event) => {
            const [providerId, modelId] = event.target.value.split('::')
            void setModel(providerId, modelId)
          }}
          className="max-w-[22rem] rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-[11.5px] text-parchment-dim focus:border-line-strong focus:outline-none"
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
          className="rounded-control border border-line bg-ink-700 px-2 py-1 text-[11.5px] text-parchment-dim focus:border-line-strong focus:outline-none"
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
