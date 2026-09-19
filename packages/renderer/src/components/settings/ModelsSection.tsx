import type { ProviderView, Undef } from '@alpha/core'
import { useEffect, useState } from 'react'
import { useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { OUTLINED_ACTION, PRIMARY_ACTION } from '../controls.ts'
import { asDraft, type DraftModel, ModelFields, modelInput } from './ModelFields.tsx'

/**
 * One provider's models, edited as a list and saved as a list. Until something is typed the rows
 * are the stored ones; the first edit makes a draft, and Save is what writes it. Nothing is sent
 * per keystroke: a model half-typed is not a model.
 */
function ModelEditor({ provider }: { provider: ProviderView }) {
  const t = useText()
  const saveModels = useProviders((state) => state.saveModels)
  const [draft, setDraft] = useState<Undef<DraftModel[]>>(undefined)
  const [error, setError] = useState('')
  const models = draft ?? provider.models.map(asDraft)

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
    // A named region, so the rows inside are read — and found — as this provider's own.
    <section aria-label={provider.name} className="rounded-card border border-line p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-ui font-medium text-parchment">{provider.name}</p>
        <span className="shrink-0 font-mono text-micro text-parchment-faint">{provider.baseUrl}</span>
      </div>

      <div className="mt-2 space-y-2">
        {provider.models.length === 0 && draft === undefined && (
          <p className="text-xs text-parchment-faint">{t('settings.noModels')}</p>
        )}
        <ModelFields models={models} onChange={setDraft} />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={draft === undefined} onClick={() => void save()} className={PRIMARY_ACTION}>
          {t('settings.saveModels')}
        </button>
        {draft !== undefined && (
          <button type="button" onClick={() => setDraft(undefined)} className={OUTLINED_ACTION}>
            {t('settings.reset')}
          </button>
        )}
        {error !== '' && <span className="min-w-0 flex-1 truncate text-xs text-danger">{error}</span>}
      </div>
    </section>
  )
}

/** Which model a conversation with nothing chosen yet runs on, by provider and model. */
function DefaultModel() {
  const t = useText()
  const snapshot = useProviders((state) => state.snapshot)
  const setDefaultModel = useProviders((state) => state.setDefaultModel)
  const chosen = snapshot.defaultModel
  const value = chosen === undefined ? '' : `${chosen.providerId}::${chosen.modelId}`

  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-micro text-parchment-faint">{t('settings.defaultModel')}</span>
        <select
          aria-label={t('settings.defaultModel')}
          value={value}
          onChange={(event) => {
            const [providerId, modelId] = event.target.value.split('::')
            void setDefaultModel(
              providerId === undefined || modelId === undefined ? undefined : { providerId, modelId },
            )
          }}
          className="w-full rounded-control border border-line bg-ink-700 px-2 py-1.5 text-code text-parchment focus:border-line-strong focus:outline-none"
        >
          <option value="">{t('settings.defaultModelAuto')}</option>
          {snapshot.providers.map((provider) => (
            <optgroup key={provider.id} label={provider.name}>
              {provider.models.map((model) => (
                <option key={model.id} value={`${provider.id}::${model.id}`}>
                  {model.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="mt-1 text-micro leading-relaxed text-parchment-faint">{t('settings.defaultModelNote')}</p>
    </div>
  )
}

/**
 * The models: which ones each connection serves, with the limits that decide how much of a
 * conversation fits, and which one a new conversation starts on. A provider is a connection and
 * this is what travels over it — two settings, two panels (ADR-0015).
 */
export function ModelsSection() {
  const t = useText()
  const snapshot = useProviders((state) => state.snapshot)
  const load = useProviders((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  // No heading of its own: the band above names the panel, and this is everything in it.
  return (
    <section aria-label={t('settings.tabModels')}>
      {snapshot.providers.length === 0 ? (
        <p className="text-code text-parchment-faint">{t('settings.modelsNoProviders')}</p>
      ) : (
        <>
          <DefaultModel />
          <div className="mt-4 space-y-2">
            {snapshot.providers.map((provider) => (
              <ModelEditor key={provider.id} provider={provider} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
