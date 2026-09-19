import type { ProviderModelDefinition, ProviderView, Undef } from '@alpha/core'
import { useEffect, useState } from 'react'
import { type ProviderTestOutcome, useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'

/**
 * One configured provider: what it is, whether a key is stored, and the three things a user
 * needs to do to it — replace the key, prove it works, delete it.
 */
export function ProviderCard({ provider }: { provider: ProviderView }) {
  const t = useText()
  const setCredential = useProviders((state) => state.setCredential)
  const remove = useProviders((state) => state.remove)
  const loadModels = useProviders((state) => state.loadModels)
  const test = useProviders((state) => state.test)
  const [secret, setSecret] = useState('')
  const [outcome, setOutcome] = useState<Undef<ProviderTestOutcome>>(undefined)
  const [models, setModels] = useState<ProviderModelDefinition[]>([])

  useEffect(() => {
    void loadModels(provider.id).then(setModels)
  }, [provider.id, loadModels])
  const firstModel = models[0]?.id ?? ''

  return (
    <li className="rounded-card border border-line bg-ink-800 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-ui font-medium text-parchment">{provider.name}</p>
          <p className="truncate font-mono text-micro text-parchment-faint">{provider.baseUrl}</p>
        </div>
        <span className={`shrink-0 text-micro ${provider.hasCredential ? 'text-jade' : 'text-amber'}`}>
          {t(provider.hasCredential ? 'settings.keyStored' : 'settings.noKey')}
        </span>
      </div>

      {/* What a stored key unlocks. Choosing one happens in the conversation header, so this
          line is the answer to "did my key work?", not a picker. */}
      {models.length > 0 && (
        <p
          className="mt-1.5 truncate font-mono text-micro text-parchment-faint"
          title={models.map((m) => m.id).join(', ')}
        >
          {t(models.length === 1 ? 'settings.oneModel' : 'settings.models', { count: models.length })} ·{' '}
          {models.map((m) => m.id).join(', ')}
        </p>
      )}

      <div className="mt-2.5 flex gap-2">
        <input
          type="password"
          value={secret}
          aria-label={t('settings.apiKeyFor', { provider: provider.name })}
          placeholder={t('settings.pasteKey')}
          onChange={(event) => setSecret(event.target.value)}
          className="min-w-0 flex-1 rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-xs text-parchment focus:border-line-strong focus:outline-none"
        />
        <button
          type="button"
          disabled={secret.trim() === ''}
          onClick={() => {
            void setCredential(provider.id, secret).then(() => setSecret(''))
          }}
          className="rounded-control bg-accent px-3 py-1 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-bright disabled:bg-accent/25 disabled:text-accent-ink/60"
        >
          {t('settings.saveKey')}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={!provider.hasCredential || firstModel === ''}
          onClick={() => void test(provider.id, firstModel).then(setOutcome)}
          className="rounded-control border border-line px-2.5 py-1 text-xs text-parchment-dim transition-colors hover:border-line-strong hover:text-parchment disabled:opacity-40"
        >
          {t('settings.test')}
        </button>
        <button
          type="button"
          onClick={() => void remove(provider.id)}
          className="rounded-control px-2 py-1 text-xs text-parchment-faint transition-colors hover:text-danger"
        >
          {t('settings.removeProvider')}
        </button>
        {outcome !== undefined && (
          <span className={`min-w-0 flex-1 truncate text-xs ${outcome.ok ? 'text-jade' : 'text-danger'}`}>
            {outcome.message}
          </span>
        )}
      </div>
    </li>
  )
}
