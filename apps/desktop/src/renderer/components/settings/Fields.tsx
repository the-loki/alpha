import { PROVIDER_APIS, type ProviderApi, type TextKey } from '@alpha/core'
import { For } from 'solid-js'
import { useText } from '../../stores/shell.ts'

export const FIELD =
  'w-full rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-xs text-parchment focus:border-line-strong focus:outline-none'

export function TextField(props: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label class="block">
      <span class="mb-1 block text-micro text-parchment-faint">{props.label}</span>
      <input
        aria-label={props.label}
        value={props.value}
        placeholder={props.placeholder}
        onInput={(event) => props.onChange(event.target.value)}
        class={FIELD}
      />
    </label>
  )
}

/** Each protocol by the name people know it by, plus the line that says who speaks it. */
const API_LABELS: Record<ProviderApi, TextKey> = {
  'openai-completions': 'settings.apiOpenai',
  'openai-responses': 'settings.apiResponses',
  'anthropic-messages': 'settings.apiAnthropic',
}

const API_NOTES: Record<ProviderApi, TextKey> = {
  'openai-completions': 'settings.apiOpenaiNote',
  'openai-responses': 'settings.apiResponsesNote',
  'anthropic-messages': 'settings.apiAnthropicNote',
}

/**
 * The protocol picker. It decides how the base URL is read and which endpoint path is called, so
 * the choice is named the way its own documentation names it, and the line under it says who
 * speaks it — "openai-completions" alone means nothing to someone who has never read the spec.
 */
export function ApiField(props: { api: ProviderApi; onChange: (api: ProviderApi) => void }) {
  const t = useText()
  return (
    <div>
      <label class="block">
        <span class="mb-1 block text-micro text-parchment-faint">{t('settings.wireProtocol')}</span>
        <select
          aria-label={t('settings.wireProtocol')}
          value={props.api}
          onInput={(event) => props.onChange(event.target.value as ProviderApi)}
          class={FIELD}
        >
          <For each={PROVIDER_APIS}>{(candidate) => <option value={candidate}>{t(API_LABELS[candidate])}</option>}</For>
        </select>
      </label>
      <p class="mt-1 text-micro leading-relaxed text-parchment-faint">{t(API_NOTES[props.api])}</p>
    </div>
  )
}
