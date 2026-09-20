import type { NetworkBind, NetworkPatch, NetworkState, Undef } from '@alpha/core'
import { createSignal, For, onMount, Show } from 'solid-js'
import { bridge } from '../../lib/bridge.ts'
import { shell, useText } from '../../stores/shell.ts'

const BIND_LABELS: Record<NetworkBind, string> = {
  local: 'This machine only',
  network: 'Anything on this network',
}

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
            <p class="text-xs text-parchment-faint">{t('settings.browserHost')}</p>
          </Show>

          <div class="mt-3 space-y-3 rounded-card border border-line bg-ink-800 p-4">
            <label class="flex items-center justify-between gap-4">
              <span class="text-ui text-parchment">{t('settings.serve')}</span>
              <input
                type="checkbox"
                aria-label={t('settings.serveLabel')}
                checked={current().enabled}
                onInput={(event) => change({ enabled: event.target.checked })}
                class="h-4 w-4 accent-[var(--color-accent)]"
              />
            </label>

            <div class="flex items-center justify-between gap-4">
              <span class="text-ui text-parchment">{t('settings.whoCanReach')}</span>
              <div class="flex gap-1.5">
                <For each={Object.keys(BIND_LABELS) as NetworkBind[]}>
                  {(bind) => (
                    <button
                      type="button"
                      aria-pressed={current().bind === bind}
                      onClick={() => change({ bind })}
                      class={`rounded-control border px-3 py-1.5 text-xs transition-colors ${
                        current().bind === bind
                          ? 'border-accent/50 bg-accent/10 text-accent'
                          : 'border-line text-parchment-dim hover:bg-ink-700'
                      }`}
                    >
                      {BIND_LABELS[bind]}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="flex items-center justify-between gap-4">
              <label class="text-ui text-parchment" for="network-port">
                Port
              </label>
              <span class="flex items-center gap-2">
                <input
                  id="network-port"
                  value={port()}
                  onInput={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => change({ port: Number(port() === '' ? 0 : port()) })}
                  class="w-20 rounded-control border border-line bg-ink-700 px-2 py-1 text-right font-mono text-code text-parchment focus:border-line-strong focus:outline-none"
                />
                <span class="text-micro text-parchment-faint">{t('settings.portHint')}</span>
              </span>
            </div>

            <TokenRow state={current()} onChange={apply} onCopied={setCopied} copied={copied()} />

            <Show when={current().error !== ''}>
              <p class="text-xs text-danger">{current().error}</p>
            </Show>

            <Show when={current().urls.length > 0}>
              <div>
                <span class="block text-ui text-parchment">{t('settings.openAt')}</span>
                <ul class="mt-1 space-y-0.5">
                  <For each={current().urls}>
                    {(url) => <li class="font-mono text-code text-parchment-dim">{url}</li>}
                  </For>
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
      <span class="block text-ui text-parchment">{t('unlock.token')}</span>
      <div class="mt-1 flex items-center gap-2">
        <code class="min-w-0 flex-1 truncate rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-code text-parchment-dim">
          {disabled() ? t('settings.tokenMinted') : props.state.token}
        </code>
        <button
          type="button"
          disabled={disabled()}
          onClick={() => {
            void navigator.clipboard.writeText(props.state.token).then(() => props.onCopied(true))
          }}
          class="rounded-control border border-line px-3 py-1.5 text-xs text-parchment transition-colors hover:border-line-strong disabled:opacity-40"
        >
          {t(props.copied ? 'message.copied' : 'message.copy')}
        </button>
        <button
          type="button"
          disabled={disabled()}
          onClick={() => void bridge().regenerateNetworkToken().then(props.onChange)}
          class="rounded-control border border-line px-3 py-1.5 text-xs text-parchment transition-colors hover:border-line-strong disabled:opacity-40"
        >
          {t('settings.replaceToken')}
        </button>
      </div>
    </div>
  )
}
