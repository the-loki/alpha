import type { ProviderApi } from '@alpha/core'
import { useState } from 'react'
import { useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { PRIMARY_ACTION } from '../controls.ts'
import { ApiField, TextField } from './Fields.tsx'

interface Draft {
  id: string
  name: string
  api: ProviderApi
  baseUrl: string
}

const emptyDraft = (): Draft => ({ id: '', name: '', api: 'openai-completions', baseUrl: '' })

/**
 * Adding a provider is describing a connection: what to call it, how to reach it, and which of the
 * three protocols it speaks. What it serves is the models panel's business, so a provider added
 * here starts with no models and says so there.
 */
export function ProviderForm() {
  const t = useText()
  const save = useProviders((state) => state.save)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState('')

  const add = async () => {
    setError('')
    try {
      await save(draft)
      setDraft(emptyDraft())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <fieldset className="mt-4 rounded-card border border-line p-3">
      <legend className="px-1 text-micro tracking-wider text-parchment-faint uppercase">
        {t('settings.addProvider')}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label={t('settings.fieldId')}
          value={draft.id}
          onChange={(id) => setDraft({ ...draft, id })}
          placeholder={t('settings.fieldIdPlaceholder')}
        />
        <TextField
          label={t('settings.fieldName')}
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
          placeholder={t('settings.fieldNamePlaceholder')}
        />
        <div className="col-span-2">
          <TextField
            label={t('settings.fieldBaseUrl')}
            value={draft.baseUrl}
            onChange={(baseUrl) => setDraft({ ...draft, baseUrl })}
            placeholder={t('settings.fieldBaseUrlPlaceholder')}
          />
        </div>
        <ApiField api={draft.api} onChange={(api) => setDraft({ ...draft, api })} />
        <div className="flex items-end">
          <button type="button" onClick={() => void add()} className={PRIMARY_ACTION}>
            {t('settings.addProvider')}
          </button>
        </div>
      </div>
      {error !== '' && <p className="mt-2 text-xs text-danger">{error}</p>}
    </fieldset>
  )
}
