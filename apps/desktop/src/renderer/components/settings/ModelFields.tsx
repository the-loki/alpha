import { Index } from 'solid-js'
import { useText } from '../../stores/shell.ts'
import { DESTRUCTIVE_ACTION, GROUP_LABEL, OUTLINED_ACTION } from '../controls.ts'
import { TextField } from './Fields.tsx'

/** One model as the form holds it: every field is a string until the save reads it. */
export interface DraftModel {
  id: string
  name: string
  contextWindow: string
  maxTokens: string
  reasoning: boolean
  images: boolean
}

/** Two digits, so a column of ordinals reads as a column. */
const ordinal = (index: number): string => String(index + 1).padStart(2, '0')

const emptyModel = (): DraftModel => ({
  id: '',
  name: '',
  contextWindow: '128000',
  maxTokens: '8192',
  reasoning: false,
  // Off: a new row is a model nobody has said anything about, and the honest answer for "can it
  // read a picture" is the one that refuses the picture rather than sending it into the void.
  images: false,
})

export const asDraft = (model: {
  id: string
  name: string
  contextWindow: number
  maxTokens: number
  reasoning: boolean
  images: boolean
}): DraftModel => ({
  id: model.id,
  name: model.name,
  contextWindow: String(model.contextWindow),
  maxTokens: String(model.maxTokens),
  reasoning: model.reasoning,
  images: model.images,
})

/** The draft in the shape the boundary validates: the numbers become numbers here and nowhere else. */
export const modelInput = (models: DraftModel[]) =>
  models.map((model) => ({
    id: model.id,
    name: model.name === '' ? model.id : model.name,
    contextWindow: Number(model.contextWindow),
    maxTokens: Number(model.maxTokens),
    reasoning: model.reasoning,
    images: model.images,
  }))

/** The models an endpoint serves, as rows being edited. Rows are positional until they are saved. */
export function ModelFields(props: { models: DraftModel[]; onChange: (models: DraftModel[]) => void }) {
  const t = useText()
  const replace = (index: number, changes: Partial<DraftModel>) =>
    props.onChange(props.models.map((model, at) => (at === index ? { ...model, ...changes } : model)))

  return (
    <div class="space-y-2">
      <Index each={props.models}>
        {(model, index) => {
          // A row has no identity of its own until it is saved, so the position is the identity:
          // it is the row's number, and a reader who cannot see it is told it on each field.
          const nth = index + 1
          return (
            // A named group per row — a fieldset, since that is what a set of controls with one name
            // is: the labels are the same in every row, and the number that tells them apart belongs
            // to the group rather than being repeated as a suffix on four fields.
            <fieldset
              class="m-0 flex min-w-0 gap-3 border-0 p-0"
              aria-label={t('settings.modelRow', { index: String(nth) })}
            >
              {/* The row's number, in the measuring voice: a column of ordinal marks beside the
                  rows they number, so the fields themselves stay unlabelled by position. */}
              <span class="w-4 shrink-0 pt-2 text-right font-mono text-label text-faint">{ordinal(index)}</span>
              {/* A block that groups fields is framed at the control's radius and inset half the
                  number, because it is nested inside the record that holds it (C5.4). */}
              <div class="min-w-0 flex-1 rounded-md border border-line bg-surface-0 p-2">
                <div class="grid grid-cols-2 gap-2">
                  <TextField
                    label={t('settings.modelId')}
                    value={model().id}
                    placeholder="model-id"
                    onChange={(id) => replace(index, { id })}
                  />
                  <TextField
                    label={t('settings.modelName')}
                    value={model().name}
                    placeholder={t('settings.displayNamePlaceholder')}
                    onChange={(name) => replace(index, { name })}
                  />
                  <TextField
                    label={t('settings.modelContext')}
                    value={model().contextWindow}
                    placeholder="128000"
                    onChange={(contextWindow) => replace(index, { contextWindow })}
                  />
                  <TextField
                    label={t('settings.modelMaxTokens')}
                    value={model().maxTokens}
                    placeholder="8192"
                    onChange={(maxTokens) => replace(index, { maxTokens })}
                  />
                </div>
                <div class="mt-2 flex items-center gap-4">
                  <label class={`flex items-center gap-2 ${GROUP_LABEL}`}>
                    <input
                      type="checkbox"
                      aria-label={t('settings.reasoning')}
                      checked={model().reasoning}
                      onInput={(event) => replace(index, { reasoning: event.target.checked })}
                      class="h-3.5 w-3.5 accent-accent"
                    />
                    {t('settings.reasoning')}
                  </label>
                  {/* What the model can be handed. It is a setting because nothing here can know it:
                      no catalog ships with the app, and only the person who typed the model id knows
                      what is behind it (ADR-0018). */}
                  <label class={`flex items-center gap-2 ${GROUP_LABEL}`}>
                    <input
                      type="checkbox"
                      aria-label={t('settings.takesPictures')}
                      checked={model().images}
                      onInput={(event) => replace(index, { images: event.target.checked })}
                      class="h-3.5 w-3.5 accent-accent"
                    />
                    {t('settings.takesPictures')}
                  </label>
                  <span class="flex-1" />
                  <button
                    type="button"
                    aria-label={t('settings.removeModel')}
                    onClick={() => props.onChange(props.models.filter((_unused, at) => at !== index))}
                    class={DESTRUCTIVE_ACTION}
                  >
                    {t('settings.removeModel')}
                  </button>
                </div>
              </div>
            </fieldset>
          )
        }}
      </Index>
      <button type="button" onClick={() => props.onChange([...props.models, emptyModel()])} class={OUTLINED_ACTION}>
        {t('settings.addModel')}
      </button>
    </div>
  )
}
