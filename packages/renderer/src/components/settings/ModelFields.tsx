import { useText } from '../../stores/shell.ts'
import { DESTRUCTIVE_ACTION, OUTLINED_ACTION } from '../controls.ts'
import { entryNumber, MARK_COLUMN } from '../ledger.ts'
import { TextField } from './Fields.tsx'

/** One model as the form holds it: every field is a string until the save reads it. */
export interface DraftModel {
  id: string
  name: string
  contextWindow: string
  maxTokens: string
  reasoning: boolean
}

export const emptyModel = (): DraftModel => ({
  id: '',
  name: '',
  contextWindow: '128000',
  maxTokens: '8192',
  reasoning: false,
})

export const asDraft = (model: {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  reasoning: boolean
}): DraftModel => ({
  id: model.id,
  name: model.name,
  contextWindow: String(model.contextWindow),
  maxTokens: String(model.maxTokens),
  reasoning: model.reasoning,
})

/** The draft in the shape the boundary validates: the numbers become numbers here and nowhere else. */
export const modelInput = (models: DraftModel[]) =>
  models.map((model) => ({
    id: model.id,
    name: model.name === '' ? model.id : model.name,
    contextWindow: Number(model.contextWindow),
    maxTokens: Number(model.maxTokens),
    reasoning: model.reasoning,
  }))

/** The models an endpoint serves, as rows being edited. Rows are positional until they are saved. */
export function ModelFields({ models, onChange }: { models: DraftModel[]; onChange: (models: DraftModel[]) => void }) {
  const t = useText()
  const replace = (index: number, changes: Partial<DraftModel>) =>
    onChange(models.map((model, at) => (at === index ? { ...model, ...changes } : model)))

  return (
    <div className="space-y-2">
      {models.map((model, index) => {
        // A row has no identity of its own until it is saved, so the position is the identity:
        // it is the row's number, and a reader who cannot see it is told it on each field.
        const key = `model-${index}`
        const nth = index + 1
        return (
          // A named group per row — a fieldset, since that is what a set of controls with one name
          // is: the labels are the same in every row, and the number that tells them apart belongs
          // to the group rather than being repeated as a suffix on four fields.
          <fieldset
            key={key}
            className="m-0 flex min-w-0 gap-3 border-0 p-0"
            aria-label={t('settings.modelRow', { index: String(nth) })}
          >
            {/* The row's number, in the page's own language: a column of ordinal marks beside the
                rows they number, so the fields themselves stay unlabelled by position. */}
            <span className={MARK_COLUMN}>{entryNumber(index)}</span>
            <div className="min-w-0 flex-1 rounded-control border border-line bg-ink-700 p-2">
              <div className="grid grid-cols-2 gap-2">
                <TextField
                  label={t('settings.modelId')}
                  value={model.id}
                  placeholder="model-id"
                  onChange={(id) => replace(index, { id })}
                />
                <TextField
                  label={t('settings.modelName')}
                  value={model.name}
                  placeholder={t('settings.displayNamePlaceholder')}
                  onChange={(name) => replace(index, { name })}
                />
                <TextField
                  label={t('settings.modelContext')}
                  value={model.contextWindow}
                  placeholder="128000"
                  onChange={(contextWindow) => replace(index, { contextWindow })}
                />
                <TextField
                  label={t('settings.modelMaxTokens')}
                  value={model.maxTokens}
                  placeholder="8192"
                  onChange={(maxTokens) => replace(index, { maxTokens })}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-parchment-dim">
                  <input
                    type="checkbox"
                    aria-label={t('settings.reasoning')}
                    checked={model.reasoning}
                    onChange={(event) => replace(index, { reasoning: event.target.checked })}
                    className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                  />
                  {t('settings.reasoning')}
                </label>
                <button
                  type="button"
                  aria-label={t('settings.removeModel')}
                  onClick={() => onChange(models.filter((_unused, at) => at !== index))}
                  className={DESTRUCTIVE_ACTION}
                >
                  {t('settings.removeModel')}
                </button>
              </div>
            </div>
          </fieldset>
        )
      })}
      <button type="button" onClick={() => onChange([...models, emptyModel()])} className={OUTLINED_ACTION}>
        {t('settings.addModel')}
      </button>
    </div>
  )
}
