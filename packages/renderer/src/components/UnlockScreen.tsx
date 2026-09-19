import { useState } from 'react'
import { rememberedToken } from '../lib/network-bridge.ts'
import { useShell, useText } from '../stores/shell.ts'

/**
 * What a browser sees before it holds a session. One field, one button, and where to find the
 * token: this is the only thing between the network and a workbench that runs shell commands, so
 * it says what it is for rather than dressing itself up as a login.
 */
export function UnlockScreen() {
  const unlock = useShell((state) => state.unlock)
  const t = useText()
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
        className="w-full max-w-md rounded-card border border-line bg-ink-800 p-6 shadow-card"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {/* The one screen that is not the workbench is still signed the same way: the stamp, in
            the same place, so a browser that has to unlock knows whose window it is looking at. */}
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-4.5 w-4.5 place-items-center rounded-control bg-accent font-mono text-micro text-accent-ink"
          >
            A
          </span>
          <span className="font-mono text-micro tracking-widest text-parchment-dim uppercase">Alpha</span>
        </span>
        <h1 className="mt-5 text-xl font-semibold text-parchment">{t('unlock.title')}</h1>
        <p className="mt-2 text-body text-parchment-dim">{t('unlock.body')}</p>

        <label className="mt-5 block">
          <span className="mb-1 block text-ui text-parchment-dim">{t('unlock.token')}</span>
          <input
            // biome-ignore lint/a11y/noAutofocus: the one thing this screen asks for.
            autoFocus
            name="token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={t('unlock.tokenPlaceholder')}
            className="w-full border border-line bg-ink-700 px-3 py-2 font-mono text-code text-parchment focus:border-line-strong focus:outline-none"
          />
        </label>

        {error !== '' && <p className="mt-2 text-ui text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy || token.trim() === ''}
          className="mt-5 w-full bg-accent px-4 py-2 text-ui font-medium text-accent-ink transition-colors hover:bg-accent-bright disabled:opacity-40"
        >
          {t(busy ? 'unlock.opening' : 'unlock.submit')}
        </button>
      </form>
    </div>
  )
}
