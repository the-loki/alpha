import { For } from 'solid-js'
import { providerActions, providers } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'
import { CONTROL_HEIGHT, FIELD_FRAME } from '../controls.ts'

/**
 * Which model a conversation with nothing chosen yet runs on, by provider and model. It is the one
 * model choice that is not a provider's own — a pick among every provider's models — so it sits at
 * the top of the providers panel rather than inside a card (ADR-0015, as amended).
 */
export function DefaultModel() {
  const t = useText()
  const value = () => {
    const chosen = providers.snapshot.defaultModelChoice
    return chosen === undefined ? '' : `${chosen.providerId}::${chosen.modelId}`
  }

  return (
    <div>
      <label class="block">
        <span class="mb-1 block text-micro text-parchment-faint">{t('settings.defaultModel')}</span>
        <select
          aria-label={t('settings.defaultModel')}
          value={value()}
          onInput={(event) => {
            const [providerId, modelId] = event.target.value.split('::')
            void providerActions.setDefaultModel(
              providerId === undefined || modelId === undefined ? undefined : { providerId, modelId },
            )
          }}
          class={`w-full px-2 text-code text-parchment ${CONTROL_HEIGHT} ${FIELD_FRAME}`}
        >
          <option value="">{t('settings.defaultModelAuto')}</option>
          <For each={providers.snapshot.providers}>
            {(provider) => (
              <optgroup label={provider.name}>
                <For each={provider.models}>
                  {(model) => <option value={`${provider.id}::${model.id}`}>{model.name}</option>}
                </For>
              </optgroup>
            )}
          </For>
        </select>
      </label>
      <p class="mt-1 text-micro leading-relaxed text-parchment-faint">{t('settings.defaultModelNote')}</p>
    </div>
  )
}
