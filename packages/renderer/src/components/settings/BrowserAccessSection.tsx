import type { NetworkBind, NetworkState } from '@alpha/core'
import { useEffect, useState } from 'react'
import { bridge } from '../../lib/bridge.ts'
import { useShell } from '../../stores/shell.ts'

const BIND_LABELS: Record<NetworkBind, string> = {
  local: 'This machine only',
  network: 'Anything on this network',
}

/**
 * Browser access: the switch, where it listens, and the token a browser has to be given. The
 * settings page is the only place the token is shown, which is why the copy sits next to it.
 */
export function BrowserAccessSection() {
  const host = useShell((state) => state.host)
  const [state, setState] = useState<NetworkState | undefined>(undefined)
  const [port, setPort] = useState('')
  const [copied, setCopied] = useState(false)

  const apply = (next: NetworkState) => {
    setState(next)
    setPort(String(next.port))
  }

  // Read once on mount: the page is the only place browser access is changed, so nothing else
  // can have moved it in the meantime.
  useEffect(() => {
    void bridge()
      .networkState()
      .then((next) => {
        setState(next)
        setPort(String(next.port))
      })
  }, [])

  if (state === undefined) return null

  const change = (patch: { enabled?: boolean; bind?: NetworkBind; port?: number }) => {
    void bridge().setNetworkAccess(patch).then(apply)
  }

  return (
    <section className="mt-8" aria-label="Browser access">
      <h2 className="text-body font-medium text-parchment">Browser access</h2>
      <p className="mt-1 text-xs text-parchment-dim">
        Serve this workbench to a browser on another device. Whoever holds the token can read every conversation and
        answer every approval — it is a remote control for this machine, not a viewer.
      </p>
      {host === 'browser' && (
        <p className="mt-2 text-xs text-parchment-faint">
          You are reading this in a browser: a browser cannot pick a folder, so use the recent list.
        </p>
      )}

      <div className="mt-3 space-y-3 rounded-card border border-line bg-ink-800 p-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-ui text-parchment">Serve to a browser</span>
          <input
            type="checkbox"
            aria-label="Serve this workbench to a browser"
            checked={state.enabled}
            onChange={(event) => change({ enabled: event.target.checked })}
            className="h-4 w-4 accent-[var(--color-ember)]"
          />
        </label>

        <div className="flex items-center justify-between gap-4">
          <span className="text-ui text-parchment">Who can reach it</span>
          <div className="flex gap-1.5">
            {(Object.keys(BIND_LABELS) as NetworkBind[]).map((bind) => (
              <button
                key={bind}
                type="button"
                aria-pressed={state.bind === bind}
                onClick={() => change({ bind })}
                className={`rounded-control border px-3 py-1.5 text-xs transition-colors ${
                  state.bind === bind
                    ? 'border-ember/50 bg-ember/10 text-ember'
                    : 'border-line text-parchment-dim hover:bg-ink-700'
                }`}
              >
                {BIND_LABELS[bind]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <label className="text-ui text-parchment" htmlFor="network-port">
            Port
          </label>
          <span className="flex items-center gap-2">
            <input
              id="network-port"
              value={port}
              onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => change({ port: Number(port === '' ? 0 : port) })}
              className="w-20 rounded-control border border-line bg-ink-700 px-2 py-1 text-right font-mono text-code text-parchment focus:border-line-strong focus:outline-none"
            />
            <span className="text-micro text-parchment-faint">0 picks one</span>
          </span>
        </div>

        <TokenRow state={state} onChange={apply} onCopied={setCopied} copied={copied} />

        {state.error !== '' && <p className="text-xs text-danger">{state.error}</p>}

        {state.urls.length > 0 && (
          <div>
            <span className="block text-ui text-parchment">Open it at</span>
            <ul className="mt-1 space-y-0.5">
              {state.urls.map((url) => (
                <li key={url} className="font-mono text-code text-parchment-dim">
                  {url}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

/** The token itself, and the two things a person can do with it: keep it, or replace it. */
function TokenRow(props: {
  state: NetworkState
  onChange: (state: NetworkState) => void
  onCopied: (copied: boolean) => void
  copied: boolean
}) {
  const { state, onChange, copied } = props
  const disabled = state.token === ''
  return (
    <div>
      <span className="block text-ui text-parchment">Access token</span>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-ink-700 px-2 py-1 font-mono text-code text-parchment-dim">
          {disabled ? 'minted when you switch it on' : state.token}
        </code>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void navigator.clipboard.writeText(state.token).then(() => props.onCopied(true))
          }}
          className="rounded-control border border-line px-3 py-1.5 text-xs text-parchment transition-colors hover:border-line-strong disabled:opacity-40"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void bridge().regenerateNetworkToken().then(onChange)}
          className="rounded-control border border-line px-3 py-1.5 text-xs text-parchment transition-colors hover:border-line-strong disabled:opacity-40"
        >
          Replace
        </button>
      </div>
    </div>
  )
}
