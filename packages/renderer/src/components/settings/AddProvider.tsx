import { useState } from 'react'
import { useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import {
  ApiField,
  type DraftProvider,
  emptyDraft,
  ModelFields,
  providerInput,
  TextField,
} from './CustomProviderFields.tsx'

/** Two ways in: a catalog provider (one click) or an endpoint the user describes. */
export function AddProvider() {
  const t = useText()
  const catalog = useProviders((state) => state.snapshot.catalog)
  const addFromCatalog = useProviders((state) => state.addFromCatalog)
  const addCustom = useProviders((state) => state.addCustom)
  const [selected, setSelected] = useState('')
  const [custom, setCustom] = useState<DraftProvider>(emptyDraft)
  const [error, setError] = useState('')

  const add = async () => {
    setError('')
    try {
      await addCustom(providerInput(custom))
      setCustom(emptyDraft())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-center gap-2">
        <select
          aria-label={t('settings.catalog')}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="min-w-0 flex-1 rounded-control border border-line bg-ink-700 px-2 py-1.5 text-code text-parchment focus:border-line-strong focus:outline-none"
        >
          <option value="">{t('settings.addKnown')}</option>
          {catalog.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} — {entry.keyHint}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={selected === ''}
          onClick={() => void addFromCatalog(selected).then(() => setSelected(''))}
          className="rounded-control border border-line px-3 py-1.5 text-xs text-parchment transition-colors hover:border-line-strong disabled:opacity-40"
        >
          {t('settings.add')}
        </button>
      </div>

      <fieldset className="rounded-card border border-line p-3">
        <legend className="px-1 text-micro uppercase tracking-wider text-parchment-faint">
          {t('settings.customEndpoint')}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label={t('settings.fieldId')}
            value={custom.id}
            onChange={(id) => setCustom({ ...custom, id })}
            placeholder={t('settings.fieldIdPlaceholder')}
          />
          <TextField
            label={t('settings.fieldName')}
            value={custom.name}
            onChange={(name) => setCustom({ ...custom, name })}
            placeholder={t('settings.fieldNamePlaceholder')}
          />
          <TextField
            label={t('settings.fieldBaseUrl')}
            value={custom.baseUrl}
            onChange={(baseUrl) => setCustom({ ...custom, baseUrl })}
            placeholder={t('settings.fieldBaseUrlPlaceholder')}
          />
          <ApiField api={custom.api} onChange={(api) => setCustom({ ...custom, api })} />
        </div>
        <ModelFields models={custom.models} onChange={(models) => setCustom({ ...custom, models })} />
        <button
          type="button"
          onClick={() => void add()}
          className="mt-3 rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-bright"
        >
          {t('settings.addCustom')}
        </button>
        {error !== '' && <p className="mt-2 text-xs text-danger">{error}</p>}
      </fieldset>
    </div>
  )
}
