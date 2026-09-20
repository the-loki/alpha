import type { ProviderApi, ProviderView, TextKey, Undef } from '@alpha/core'
import { useState } from 'react'
import { type ProviderTestOutcome, useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { DESTRUCTIVE_ACTION, OUTLINED_ACTION, PRIMARY_ACTION } from '../controls.ts'
import { asDraft, type DraftModel, ModelFields, modelInput } from './ModelFields.tsx'

const API_NAMES: Record<ProviderApi, TextKey> = {
  'openai-completions': 'settings.apiOpenai',
  'openai-responses': 'settings.apiResponses',
  'anthropic-messages': 'settings.apiAnthropic',
}

/**
 * The provider's model sub-list, edited where it belongs: under the connection that serves it. A
 * model is a child of its provider — it has no life outside the card — so the rows are a numbered
 * sub-list with the count in the section's label, and Save writes the list as a list. Until
 * something is typed the rows are the stored ones; the first edit makes a draft, and nothing is
 * sent per keystroke, because a model half-typed is not a model.
 */
function ModelSubList({ provider }: { provider: ProviderView }) {
  const t = useText()
  const saveModels = useProviders((state) => state.saveModels)
  const [draft, setDraft] = useState<Undef<DraftModel[]>>(undefined)
  const [error, setError] = useState('')
  const models = draft ?? provider.models.map(asDraft)
  const dirty = draft !== undefined

  const save = async () => {
    setError('')
    try {
      await saveModels(provider.id, modelInput(models))
      setDraft(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <section aria-label={provider.name} className="mt-3 border-t border-line pt-3">
      <div className="flex items-center gap-2">
        <h3 className="font-mono text-micro tracking-widest text-parchment-faint uppercase">
          {t('settings.modelsLabel')}
        </h3>
        <span className="font-mono text-micro text-parchment-faint">{provider.models.length}</span>
        <span className="flex-1" />
        {dirty && (
          <button type="button" onClick={() => setDraft(undefined)} className={OUTLINED_ACTION}>
            {t('settings.reset')}
          </button>
        )}
      </div>

      <div className="mt-2.5">
        {provider.models.length === 0 && !dirty && (
          <p className="text-micro leading-relaxed text-parchment-faint">{t('settings.noModels')}</p>
        )}
        <ModelFields models={models} onChange={setDraft} />
      </div>

      <div className="mt-3 flex items-center justify-end gap-3 border-t border-line pt-3">
        {error !== '' && <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>}
        <button type="button" disabled={!dirty} onClick={() => void save()} className={PRIMARY_ACTION}>
          {t('settings.saveModels')}
        </button>
      </div>
    </section>
  )
}

/**
 * One connection, and everything that travels over it. The card is a group with three parts — who
 * it is, the key it is reached with, and the models it serves as a sub-list — because a model is a
 * child of its provider and is configured there rather than in a list of its own.
 */
export function ProviderCard({ provider }: { provider: ProviderView }) {
  const t = useText()
  const setCredential = useProviders((state) => state.setCredential)
  const remove = useProviders((state) => state.remove)
  const test = useProviders((state) => state.test)
  const [secret, setSecret] = useState('')
  const [outcome, setOutcome] = useState<Undef<ProviderTestOutcome>>(undefined)
  const firstModel = provider.models[0]?.id ?? ''

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

      <p className="mt-1.5 flex items-center gap-2 text-micro text-parchment-faint">
        <span>{t(API_NAMES[provider.api])}</span>
        <span aria-hidden="true">·</span>
        <span>
          {provider.models.length === 1
            ? t('settings.oneModel')
            : t('settings.models', { count: provider.models.length })}
        </span>
      </p>

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
          onClick={() => void setCredential(provider.id, secret).then(() => setSecret(''))}
          className={PRIMARY_ACTION}
        >
          {t('settings.saveKey')}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={!provider.hasCredential || firstModel === ''}
          onClick={() => void test(provider.id, firstModel).then(setOutcome)}
          className={OUTLINED_ACTION}
        >
          {t('settings.test')}
        </button>
        <button type="button" onClick={() => void remove(provider.id)} className={DESTRUCTIVE_ACTION}>
          {t('settings.removeProvider')}
        </button>
        {outcome !== undefined && (
          <span className={`min-w-0 flex-1 truncate text-xs ${outcome.ok ? 'text-jade' : 'text-danger'}`}>
            {outcome.message}
          </span>
        )}
      </div>

      <ModelSubList provider={provider} />
    </li>
  )
}
