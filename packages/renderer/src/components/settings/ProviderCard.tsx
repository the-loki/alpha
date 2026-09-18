import type { ProviderView } from '@alpha/core'
import { useEffect, useState } from 'react'
import { type ProviderTestOutcome, useProviders } from '../../stores/providers.ts'

/**
 * One configured provider: what it is, whether a key is stored, and the three things a user
 * needs to do to it — replace the key, prove it works, delete it.
 */
export function ProviderCard({ provider }: { provider: ProviderView }) {
  const setCredential = useProviders((state) => state.setCredential)
  const remove = useProviders((state) => state.remove)
  const loadModels = useProviders((state) => state.loadModels)
  const test = useProviders((state) => state.test)
  const [secret, setSecret] = useState('')
  const [outcome, setOutcome] = useState<ProviderTestOutcome | undefined>(undefined)
  const [firstModel, setFirstModel] = useState('')

  useEffect(() => {
    void loadModels(provider.id).then((models) => setFirstModel(models[0]?.id ?? ''))
  }, [provider.id, loadModels])

  return (
    <li className="rounded-card border border-line bg-ink-800 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-parchment">{provider.name}</p>
          <p className="truncate font-mono text-[11px] text-parchment-faint">{provider.baseUrl}</p>
        </div>
        <span className={`shrink-0 text-[11px] ${provider.hasCredential ? 'text-jade' : 'text-amber'}`}>
          {provider.hasCredential ? 'key stored' : 'no key'}
        </span>
      </div>

      <div className="mt-2.5 flex gap-2">
        <input
          type="password"
          value={secret}
          aria-label={`API key for ${provider.name}`}
          placeholder="Paste the key"
          onChange={(event) => setSecret(event.target.value)}
          className="min-w-0 flex-1 rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-[12px] text-parchment focus:border-line-strong focus:outline-none"
        />
        <button
          type="button"
          disabled={secret.trim() === ''}
          onClick={() => {
            void setCredential(provider.id, secret).then(() => setSecret(''))
          }}
          className="rounded-control bg-ember px-3 py-1 text-[12px] font-medium text-ember-ink transition-colors hover:bg-ember-bright disabled:bg-ember/25 disabled:text-ember-ink/60"
        >
          Save key
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={!provider.hasCredential || firstModel === ''}
          onClick={() => void test(provider.id, firstModel).then(setOutcome)}
          className="rounded-control border border-line px-2.5 py-1 text-[12px] text-parchment-dim transition-colors hover:border-line-strong hover:text-parchment disabled:opacity-40"
        >
          Test
        </button>
        <button
          type="button"
          onClick={() => void remove(provider.id)}
          className="rounded-control px-2 py-1 text-[12px] text-parchment-faint transition-colors hover:text-danger"
        >
          Delete
        </button>
        {outcome !== undefined && (
          <span className={`min-w-0 flex-1 truncate text-[12px] ${outcome.ok ? 'text-jade' : 'text-danger'}`}>
            {outcome.message}
          </span>
        )}
      </div>
    </li>
  )
}
