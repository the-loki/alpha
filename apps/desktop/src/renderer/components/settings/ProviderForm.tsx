import type { ProviderApi } from '@alpha/core'
import { createSignal, Show } from 'solid-js'
import { providerActions } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { GROUP_LABEL, PRIMARY_ACTION } from '../controls.ts'
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
  const [draft, setDraft] = createSignal<Draft>(emptyDraft())
  const [error, setError] = createSignal('')

  const add = async () => {
    setError('')
    try {
      await providerActions.save(draft())
      setDraft(emptyDraft())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    // A section of the panel, not a box with a legend on its border: the label is a heading, the
    // fields sit under it in the panel's own grid, and the one primary action is in the footer the
    // section ends with — where every form in the app ends.
    <section aria-label={t('settings.addProvider')} class="mt-4 rounded-card border border-line bg-ink-800/50 p-4">
      <h3 class={GROUP_LABEL}>{t('settings.addProvider')}</h3>
      <div class="mt-3 grid grid-cols-2 gap-3">
        <TextField
          label={t('settings.fieldId')}
          value={draft().id}
          onChange={(id) => setDraft((current) => ({ ...current, id }))}
          placeholder={t('settings.fieldIdPlaceholder')}
        />
        <TextField
          label={t('settings.fieldName')}
          value={draft().name}
          onChange={(name) => setDraft((current) => ({ ...current, name }))}
          placeholder={t('settings.fieldNamePlaceholder')}
        />
        <div class="col-span-2">
          <TextField
            label={t('settings.fieldBaseUrl')}
            value={draft().baseUrl}
            onChange={(baseUrl) => setDraft((current) => ({ ...current, baseUrl }))}
            placeholder={t('settings.fieldBaseUrlPlaceholder')}
          />
        </div>
        <ApiField api={draft().api} onChange={(api) => setDraft((current) => ({ ...current, api }))} />
      </div>
      <Show when={error() !== ''}>
        <p class="mt-3 rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error()}</p>
      </Show>
      <div class="mt-4 flex items-center justify-end gap-3 border-t border-line pt-3">
        <button type="button" onClick={() => void add()} class={PRIMARY_ACTION}>
          {t('settings.addProvider')}
        </button>
      </div>
    </section>
  )
}
