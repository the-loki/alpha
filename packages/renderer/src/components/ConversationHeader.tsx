import { THINKING_LEVELS, type ThinkingLevel, thinkingLabel } from '@alpha/core'
import { useEffect } from 'react'
import { useConversations } from '../stores/conversations.ts'
import { useProviders } from '../stores/providers.ts'

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
