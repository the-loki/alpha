import type { NetworkBind, NetworkPatch, NetworkState, TextKey, Undef } from '@alpha/core'
import { createSignal, For, onMount, Show } from 'solid-js'
import { bridge } from '../../lib/bridge.ts'
import { shell, useText } from '../../stores/shell.ts'
import { CONTROL_HEIGHT, DANGER_ACTION, FIELD_FRAME, GROUP_LABEL, OUTLINED_ACTION } from '../controls.ts'

const BIND_LABELS: Record<NetworkBind, TextKey> = {
  local: 'settings.bindLocal',
  network: 'settings.bindNetwork',
}

/** A choice carries a mark, not only a colour (C5.7): the chosen one is tinted, and `aria-pressed`
    says the same to a reader. */
const CHOICE = `inline-flex ${CONTROL_HEIGHT} items-center gap-2 rounded-md border px-3 font-mono text-label font-medium transition-colors duration-normal`
const CHOSEN = 'border-accent/50 bg-accent/10 text-accent'
const RESTING = 'border-line text-muted hover:bg-surface-1'

/**
 * Browser access: the switch, where it listens, and the token a browser has to be given. The
 * settings page is the only place the token is shown, which is why the copy sits next to it.
 */
export function BrowserAccessSection() {
  const t = useText()
  const [state, setState] = createSignal<Undef<NetworkState>>(undefined)
  const [port, setPort] = createSignal('')
  const [copied, setCopied] = createSignal(false)

  const apply = (next: NetworkState) => {
    setState(next)
    setPort(String(next.port))
  }

  // Read once on mount: the page is the only place browser access is changed, so nothing else
  // can have moved it in the meantime.
  onMount(() => {
    void bridge().networkState().then(apply)
  })

  const change = (patch: NetworkPatch) => {
    void bridge().setNetworkAccess(patch).then(apply)
  }

  return (
    <Show when={state()}>
      {(current) => (
        <section aria-label={t('settings.tabBrowserAccess')}>
          {/* The panel's own heading says what this is; saying it again here would make the page read
              as two versions of the same sentence. */}
          <Show when={shell.host === 'browser'}>
            <p class="max-w-measure font-text text-name leading-relaxed text-faint">{t('settings.browserHost')}</p>
          </Show>

          {/* One connection's record: a framed group block on the page, inset one number (C5.4). */}
          <div class="space-y-3 rounded-lg border border-line bg-surface-0 p-4">
            <label class="flex items-center justify-between gap-4">
              <span class={GROUP_LABEL}>{t('settings.serve')}</span>
              <input
                type="checkbox"
                aria-label={t('settings.serveLabel')}
                checked={current().enabled}
                onInput={(event) => change({ enabled: event.target.checked })}
                class="h-4 w-4 accent-accent"
              />
            </label>

            <div class="flex items-center justify-between gap-4">
              <span class={GROUP_LABEL}>{t('settings.whoCanReach')}</span>
              <div class="flex gap-1.5">
                <For each={Object.keys(BIND_LABELS) as NetworkBind[]}>
                  {(bind) => (
                    <button
                      type="button"
                      aria-pressed={current().bind === bind}
                      onClick={() => change({ bind })}
                      class={`${CHOICE} ${current().bind === bind ? CHOSEN : RESTING}`}
                    >
                      {t(BIND_LABELS[bind])}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="flex items-center justify-between gap-4">
              <label class={GROUP_LABEL} for="network-port">
                {t('settings.port')}
              </label>
              <span class="flex items-center gap-2">
                <input
                  id="network-port"
                  value={port()}
                  onInput={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => change({ port: Number(port() === '' ? 0 : port()) })}
                  class={`w-20 px-2 text-right font-mono text-code ${CONTROL_HEIGHT} ${FIELD_FRAME}`}
                />
                <span class="font-mono text-label text-faint">{t('settings.portHint')}</span>
              </span>
            </div>

            <TokenRow state={current()} onChange={apply} onCopied={setCopied} copied={copied()} />

            <Show when={current().error !== ''}>
              <p class="max-w-measure font-text text-name text-danger">{current().error}</p>
            </Show>

            <Show when={current().urls.length > 0}>
              <div>
                <span class={`block ${GROUP_LABEL}`}>{t('settings.openAt')}</span>
                <ul class="mt-1 space-y-0.5">
                  <For each={current().urls}>{(url) => <li class="font-mono text-code text-muted">{url}</li>}</For>
                </ul>
              </div>
            </Show>
          </div>
        </section>
      )}
    </Show>
  )
}

/** The token itself, and the two things a person can do with it: keep it, or replace it. */
function TokenRow(props: {
  state: NetworkState
  onChange: (state: NetworkState) => void
  onCopied: (copied: boolean) => void
  copied: boolean
}) {
  const t = useText()
  const disabled = () => props.state.token === ''
  return (
    <div>
      <span class={`block ${GROUP_LABEL}`}>{t('unlock.token')}</span>
      <div class="mt-1 flex items-center gap-2">
        <code
          class={`flex min-w-0 flex-1 items-center truncate border border-line bg-surface-1 px-2 font-mono text-code text-muted ${CONTROL_HEIGHT}`}
        >
          {disabled() ? t('settings.tokenMinted') : props.state.token}
        </code>
        <button
          type="button"
          disabled={disabled()}
          onClick={() => {
            void navigator.clipboard.writeText(props.state.token).then(() => props.onCopied(true))
          }}
          class={OUTLINED_ACTION}
        >
          {t(props.copied ? 'message.copied' : 'message.copy')}
        </button>
        <button
          type="button"
          disabled={disabled()}
          onClick={() => void bridge().regenerateNetworkToken().then(props.onChange)}
          class={DANGER_ACTION}
        >
          {t('settings.replaceToken')}
        </button>
      </div>
    </div>
  )
}
