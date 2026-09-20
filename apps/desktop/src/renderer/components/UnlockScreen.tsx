import { createSignal, Show } from 'solid-js'
import { rememberedToken } from '../lib/network-bridge.ts'
import { shellActions, useText } from '../stores/shell.ts'

/**
 * What a browser sees before it holds a session. One field, one button, and where to find the
 * token: this is the only thing between the network and a workbench that runs shell commands, so
 * it says what it is for rather than dressing itself up as a login.
 */
export function UnlockScreen() {
  const t = useText()
  const [token, setToken] = createSignal(rememberedToken())
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await shellActions.unlock(token().trim())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="grid h-screen place-items-center bg-ink-900 px-6">
      <form
        class="w-full max-w-md rounded-card border border-line bg-ink-800 p-6 shadow-card"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {/* The one screen that is not the workbench is still signed the same way: the stamp, in
            the same place, so a browser that has to unlock knows whose window it is looking at. */}
        <span class="flex items-center gap-2">
          <span
            aria-hidden="true"
            class="grid h-4.5 w-4.5 place-items-center rounded-control bg-accent font-mono text-micro text-accent-ink"
          >
            A
          </span>
          <span class="font-mono text-micro tracking-widest text-parchment-dim uppercase">Alpha</span>
        </span>
        <h1 class="mt-5 font-display text-2xl font-medium text-parchment">{t('unlock.title')}</h1>
        <p class="mt-2 text-body text-parchment-dim">{t('unlock.body')}</p>

        <label class="mt-5 block">
          <span class="mb-1 block text-ui text-parchment-dim">{t('unlock.token')}</span>
          <input
            // Autofocus is the point: it is the one thing this screen asks for.
            autofocus
            name="token"
            value={token()}
            onInput={(event) => setToken(event.target.value)}
            placeholder={t('unlock.tokenPlaceholder')}
            class="w-full border border-line bg-ink-700 px-3 py-2 font-mono text-code text-parchment focus:border-line-strong focus:outline-none"
          />
        </label>

        <Show when={error() !== ''}>
          <p class="mt-2 text-ui text-danger">{error()}</p>
        </Show>

        <button
          type="submit"
          disabled={busy() || token().trim() === ''}
          class="mt-5 w-full bg-accent px-4 py-2 text-ui font-medium text-accent-ink transition-colors hover:bg-accent-bright disabled:opacity-40"
        >
          {t(busy() ? 'unlock.opening' : 'unlock.submit')}
        </button>
      </form>
    </div>
  )
}
