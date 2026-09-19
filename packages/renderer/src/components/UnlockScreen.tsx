import { useState } from 'react'
import { rememberedToken } from '../lib/network-bridge.ts'
import { useShell } from '../stores/shell.ts'

/**
 * What a browser sees before it holds a session. One field, one button, and where to find the
 * token: this is the only thing between the network and a workbench that runs shell commands, so
 * it says what it is for rather than dressing itself up as a login.
 */
export function UnlockScreen() {
  const unlock = useShell((state) => state.unlock)
  const [token, setToken] = useState(rememberedToken())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await unlock(token.trim())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid h-screen place-items-center bg-ink-900 px-6">
      <form
        className="w-full max-w-md rounded-card border border-line bg-ink-800 p-6"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <h1 className="font-serif text-2xl text-parchment">This workbench is not yours yet</h1>
        <p className="mt-2 text-body text-parchment-dim">
          Alpha is running on another machine, and it can run shell commands in a folder there. Paste the access token
          from that machine's Settings, under <em>Browser access</em>.
        </p>

        <label className="mt-5 block">
          <span className="mb-1 block text-ui text-parchment-dim">Access token</span>
          <input
            // biome-ignore lint/a11y/noAutofocus: the one thing this screen asks for.
            autoFocus
            name="token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="paste the token"
            className="w-full rounded-control border border-line bg-ink-700 px-3 py-2 font-mono text-code text-parchment focus:border-line-strong focus:outline-none"
          />
        </label>

        {error !== '' && <p className="mt-2 text-ui text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy || token.trim() === ''}
          className="mt-5 w-full rounded-control bg-ember px-4 py-2 text-ui font-medium text-ember-ink transition-colors hover:bg-ember-bright disabled:opacity-40"
        >
          {busy ? 'Opening…' : 'Open the workbench'}
        </button>
      </form>
    </div>
  )
}
