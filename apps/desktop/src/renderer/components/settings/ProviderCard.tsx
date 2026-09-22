import type { ProviderApi, ProviderView, TextKey, Undef } from '@alpha/core'
import { createSignal, Show } from 'solid-js'
import { type ProviderTestOutcome, providerActions } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import {
  CONTROL_HEIGHT,
  DESTRUCTIVE_ACTION,
  FIELD_FRAME,
  GROUP_LABEL,
  OUTLINED_ACTION,
  PRIMARY_ACTION,
} from '../controls.ts'
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
function ModelSubList(props: { provider: ProviderView }) {
  const t = useText()
  const [draft, setDraft] = createSignal<Undef<DraftModel[]>>(undefined)
  const [error, setError] = createSignal('')
  const models = () => draft() ?? props.provider.models.map(asDraft)
  const dirty = () => draft() !== undefined

  const save = async () => {
    setError('')
    try {
      await providerActions.saveModels(props.provider.id, modelInput(models()))
      setDraft(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <section aria-label={props.provider.name} class="mt-3 border-t border-line pt-3">
      <div class="flex items-center gap-2">
        <h3 class={GROUP_LABEL}>{t('settings.modelsLabel')}</h3>
        <span class="font-mono text-label text-faint">{props.provider.models.length}</span>
        <span class="flex-1" />
        <Show when={dirty()}>
          <button type="button" onClick={() => setDraft(undefined)} class={OUTLINED_ACTION}>
            {t('settings.reset')}
          </button>
        </Show>
      </div>

      <div class="mt-2.5">
        <Show when={props.provider.models.length === 0 && !dirty()}>
          <p class="font-text text-name leading-relaxed text-faint">{t('settings.noModels')}</p>
        </Show>
        <ModelFields models={models()} onChange={setDraft} />
      </div>

      <div class="mt-3 flex items-center justify-end gap-3 border-t border-line pt-3">
        <Show when={error() !== ''}>
          <span class="min-w-0 flex-1 truncate font-text text-name text-danger">{error()}</span>
        </Show>
        <button type="button" disabled={!dirty()} onClick={() => void save()} class={PRIMARY_ACTION}>
          {t('settings.saveModels')}
        </button>
      </div>
    </section>
  )
}

/**
 * One connection, and everything that travels over it. The record is a group with three parts — who
 * it is, the key it is reached with, and the models it serves as a sub-list — because a model is a
 * child of its provider and is configured there rather than in a list of its own.
 */
export function ProviderCard(props: { provider: ProviderView }) {
  const t = useText()
  const [secret, setSecret] = createSignal('')
  const [outcome, setOutcome] = createSignal<Undef<ProviderTestOutcome>>(undefined)
  const firstModel = () => props.provider.models[0]?.id ?? ''

  return (
    <li class="rounded-lg border border-line bg-surface-0 p-4">
      <div class="flex items-baseline justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate font-text text-name text-foreground">{props.provider.name}</p>
          <p class="truncate font-mono text-label text-faint">{props.provider.baseUrl}</p>
        </div>
        <span class={`shrink-0 font-mono text-label ${props.provider.hasCredential ? 'text-success' : 'text-warning'}`}>
          {t(props.provider.hasCredential ? 'settings.keyStored' : 'settings.noKey')}
        </span>
      </div>

      <p class="mt-1.5 flex items-center gap-2 font-mono text-label text-faint">
        <span>{t(API_NAMES[props.provider.api])}</span>
        <span aria-hidden="true">·</span>
        <span>
          {props.provider.models.length === 1
            ? t('settings.oneModel')
            : t('settings.models', { count: props.provider.models.length })}
        </span>
      </p>

      <div class="mt-2.5 flex gap-2">
        <input
          type="password"
          value={secret()}
          aria-label={t('settings.apiKeyFor', { provider: props.provider.name })}
          placeholder={t('settings.pasteKey')}
          onInput={(event) => setSecret(event.target.value)}
          class={`min-w-0 flex-1 px-2 font-mono text-code ${CONTROL_HEIGHT} ${FIELD_FRAME}`}
        />
        <button
          type="button"
          disabled={secret().trim() === ''}
          onClick={() => void providerActions.setCredential(props.provider.id, secret()).then(() => setSecret(''))}
          class={PRIMARY_ACTION}
        >
          {t('settings.saveKey')}
        </button>
      </div>

      <div class="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={!props.provider.hasCredential || firstModel() === ''}
          onClick={() => void providerActions.test(props.provider.id, firstModel()).then(setOutcome)}
          class={OUTLINED_ACTION}
        >
          {t('settings.test')}
        </button>
        <button type="button" onClick={() => void providerActions.remove(props.provider.id)} class={DESTRUCTIVE_ACTION}>
          {t('settings.removeProvider')}
        </button>
        <Show when={outcome()}>
          {(result) => (
            <span class={`min-w-0 flex-1 truncate font-text text-name ${result().ok ? 'text-success' : 'text-danger'}`}>
              {result().message}
            </span>
          )}
        </Show>
      </div>

      <ModelSubList provider={props.provider} />
    </li>
  )
}
