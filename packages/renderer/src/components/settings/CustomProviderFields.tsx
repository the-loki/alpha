import { type CustomProviderInput, PROVIDER_APIS, type ProviderApi } from '@alpha/core'
import { useText } from '../../stores/shell.ts'
import { DESTRUCTIVE_ACTION } from '../controls.ts'

/** One model as the form holds it: every field is a string until the submit reads it. */
export interface DraftModel {
  id: string
  name: string
  contextWindow: string
  maxTokens: string
  reasoning: boolean
}

export interface DraftProvider {
  id: string
  name: string
  api: ProviderApi
  baseUrl: string
  models: DraftModel[]
}

export const emptyModel = (): DraftModel => ({
  id: '',
  name: '',
  contextWindow: '128000',
  maxTokens: '8192',
  reasoning: false,
})

export function emptyDraft(): DraftProvider {
  return { id: '', name: '', api: 'openai-completions', baseUrl: '', models: [emptyModel()] }
}

/** The draft in the shape the IPC contract validates, so the boundary sees exactly what was typed. */
export const providerInput = (draft: DraftProvider): CustomProviderInput => ({
  id: draft.id,
  name: draft.name === '' ? draft.id : draft.name,
  api: draft.api,
  baseUrl: draft.baseUrl,
  models: draft.models.map((model) => ({
    id: model.id,
    name: model.name === '' ? model.id : model.name,
    contextWindow: Number(model.contextWindow),
    maxTokens: Number(model.maxTokens),
    reasoning: model.reasoning,
  })),
})

const FIELD =
  'w-full rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-xs text-parchment focus:border-line-strong focus:outline-none'

export function TextField(props: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-micro text-parchment-faint">{props.label}</span>
      <input
        aria-label={props.label}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        className={FIELD}
      />
    </label>
  )
}

/** The models an endpoint serves: at least one, and each with its own limits. */
export function ModelFields({ models, onChange }: { models: DraftModel[]; onChange: (models: DraftModel[]) => void }) {
  const t = useText()
  const replace = (index: number, changes: Partial<DraftModel>) =>
    onChange(models.map((model, at) => (at === index ? { ...model, ...changes } : model)))

  return (
    <div className="mt-3 space-y-3">
      {models.map((model, index) => (
        // Rows are positional and have no identity of their own until they are saved, and the
        // labels carry the position for the same reason.
        // biome-ignore lint/suspicious/noArrayIndexKey: the position is the identity here.
        <div key={index} className="rounded-control border border-line bg-ink-800/60 p-2">
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label={`Model id ${index + 1}`}
              value={model.id}
              placeholder="model-id"
              onChange={(id) => replace(index, { id })}
            />
            <TextField
              label={`Display name ${index + 1}`}
              value={model.name}
              placeholder={t('settings.displayNamePlaceholder')}
              onChange={(name) => replace(index, { name })}
            />
            <TextField
              label={`Context window ${index + 1}`}
              value={model.contextWindow}
              placeholder="128000"
              onChange={(contextWindow) => replace(index, { contextWindow })}
            />
            <TextField
              label={`Max output ${index + 1}`}
              value={model.maxTokens}
              placeholder="8192"
              onChange={(maxTokens) => replace(index, { maxTokens })}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-parchment-dim">
              <input
                type="checkbox"
                aria-label={`Reasoning ${index + 1}`}
                checked={model.reasoning}
                onChange={(event) => replace(index, { reasoning: event.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
              />
              {t('settings.reasoning')}
            </label>
            {models.length > 1 && (
              <button
                type="button"
                aria-label={`Remove model ${index + 1}`}
                onClick={() => onChange(models.filter((_, at) => at !== index))}
                className={DESTRUCTIVE_ACTION}
              >
                {t('settings.removeModel')}
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...models, emptyModel()])}
        className="rounded-control border border-line px-2.5 py-1 text-xs text-parchment-dim transition-colors hover:border-line-strong hover:text-parchment"
      >
        {t('settings.addModel')}
      </button>
    </div>
  )
}

/** The protocol picker: it decides how the base URL is read, so it is not a detail. */
export function ApiField({ api, onChange }: { api: ProviderApi; onChange: (api: ProviderApi) => void }) {
  const t = useText()
  return (
    <label className="block">
      <span className="mb-1 block text-micro text-parchment-faint">{t('settings.wireProtocol')}</span>
      <select
        aria-label={t('settings.wireProtocol')}
        value={api}
        onChange={(event) => onChange(event.target.value as ProviderApi)}
        className={FIELD}
      >
        {PROVIDER_APIS.map((candidate) => (
          <option key={candidate} value={candidate}>
            {candidate}
          </option>
        ))}
      </select>
    </label>
  )
}
