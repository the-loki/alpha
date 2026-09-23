import { PROVIDER_APIS, PROVIDER_AUTH_STYLES, type ProviderApi, type ProviderAuthStyle } from '@alpha/domain'
import type { TextKey } from '@alpha/i18n'
import { For } from 'solid-js'
import { useText } from '../../stores/shell.ts'
import { CONTROL_HEIGHT, FIELD_FRAME, GROUP_LABEL } from '../controls.ts'

/** A field is a body like a button is: one height, one hairline, and the well it stands in (C5.4).
    A typed value is data, so it is set in the apparatus voice (C5.3). */
export const FIELD = `w-full px-2 font-mono text-code ${CONTROL_HEIGHT} ${FIELD_FRAME}`

export function TextField(props: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label class="block">
      <span class={`mb-1 block ${GROUP_LABEL}`}>{props.label}</span>
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

/** The line under a field that says what the choice means (C5.4). */
function FieldNote(props: { text: string }) {
  return <p class="mt-1 max-w-measure font-text text-name leading-relaxed text-faint">{props.text}</p>
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
        <span class={`mb-1 block ${GROUP_LABEL}`}>{t('settings.wireProtocol')}</span>
        <select
          aria-label={t('settings.wireProtocol')}
          value={props.api}
          onInput={(event) => props.onChange(event.target.value as ProviderApi)}
          class={FIELD}
        >
          <For each={PROVIDER_APIS}>{(candidate) => <option value={candidate}>{t(API_LABELS[candidate])}</option>}</For>
        </select>
      </label>
      <FieldNote text={t(API_NOTES[props.api])} />
    </div>
  )
}

/** The header the key rides in. Most endpoints take the wire's own; a few only take Bearer. */
const AUTH_STYLE_LABELS: Record<ProviderAuthStyle, TextKey> = {
  'api-key': 'settings.authStyleApiKey',
  bearer: 'settings.authStyleBearer',
}

export function AuthStyleField(props: {
  authStyle: ProviderAuthStyle
  onChange: (authStyle: ProviderAuthStyle) => void
}) {
  const t = useText()
  return (
    <div>
      <label class="block">
        <span class={`mb-1 block ${GROUP_LABEL}`}>{t('settings.authStyle')}</span>
        <select
          aria-label={t('settings.authStyle')}
          value={props.authStyle}
          onInput={(event) => props.onChange(event.target.value as ProviderAuthStyle)}
          class={FIELD}
        >
          <For each={PROVIDER_AUTH_STYLES}>
            {(candidate) => <option value={candidate}>{t(AUTH_STYLE_LABELS[candidate])}</option>}
          </For>
        </select>
      </label>
      <FieldNote text={t('settings.authStyleNote')} />
    </div>
  )
}
