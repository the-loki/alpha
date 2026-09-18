import { useState } from 'react'
import { useProviders } from '../../stores/providers.ts'
import { ApiField, type DraftProvider, emptyDraft, ModelFields, providerInput } from './CustomProviderFields.tsx'

/** Two ways in: a catalog provider (one click) or an endpoint the user describes. */
export function AddProvider() {
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
          aria-label="Add a provider from the catalog"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="min-w-0 flex-1 rounded-control border border-line bg-ink-700 px-2 py-1.5 text-[12.5px] text-parchment focus:border-line-strong focus:outline-none"
        >
          <option value="">Add a known provider…</option>
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
          className="rounded-control border border-line px-3 py-1.5 text-[12px] text-parchment transition-colors hover:border-line-strong disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <fieldset className="rounded-card border border-line p-3">
        <legend className="px-1 text-[11px] uppercase tracking-wider text-parchment-faint">Custom endpoint</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Id"
            value={custom.id}
            onChange={(id) => setCustom({ ...custom, id })}
            placeholder="my-endpoint"
          />
          <Field
            label="Name"
            value={custom.name}
            onChange={(name) => setCustom({ ...custom, name })}
            placeholder="My endpoint"
          />
          <Field
            label="Base URL"
            value={custom.baseUrl}
            onChange={(baseUrl) => setCustom({ ...custom, baseUrl })}
            placeholder="the provider base url"
          />
          <ApiField api={custom.api} onChange={(api) => setCustom({ ...custom, api })} />
        </div>
        <ModelFields models={custom.models} onChange={(models) => setCustom({ ...custom, models })} />
        <button
          type="button"
          onClick={() => void add()}
          className="mt-3 rounded-control bg-ember px-3 py-1.5 text-[12px] font-medium text-ember-ink transition-colors hover:bg-ember-bright"
        >
          Add custom provider
        </button>
        {error !== '' && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </fieldset>
    </div>
  )
}

function Field(props: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-parchment-faint">{props.label}</span>
      <input
        aria-label={props.label}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-[12px] text-parchment focus:border-line-strong focus:outline-none"
      />
    </label>
  )
}
