import { useProviders } from '../../stores/providers.ts'
import { useText } from '../../stores/shell.ts'

/**
 * Which model a conversation with nothing chosen yet runs on, by provider and model. It is the one
 * model choice that is not a provider's own — a pick among every provider's models — so it sits at
 * the top of the providers panel rather than inside a card (ADR-0015, as amended).
 */
export function DefaultModel() {
  const t = useText()
  const snapshot = useProviders((state) => state.snapshot)
  const setDefaultModel = useProviders((state) => state.setDefaultModel)
  const chosen = snapshot.defaultModelChoice
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
