import { createSignal, Show } from 'solid-js'
import { rememberedToken } from '../lib/network-bridge.ts'
import { shellActions, useText } from '../stores/shell.ts'
import { FIELD_FRAME, PRIMARY_ACTION } from './controls.ts'
import { Mark } from './TitleBar.tsx'

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
        class="w-full max-w-md rounded-card border border-line bg-ink-800 p-8 shadow-card"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {/* The one screen that is not the workbench is still signed the same way: the mark, in
            the same place, so a browser that has to unlock knows whose window it is looking at. */}
        <span class="flex items-center gap-2">
          <Mark />
          <span class="font-mono text-micro tracking-[0.2em] text-parchment-dim uppercase">Alpha</span>
        </span>
        <h1 class="mt-6 font-display text-2xl font-semibold tracking-tight text-parchment">{t('unlock.title')}</h1>
        <p class="mt-2 max-w-measure text-body leading-relaxed text-parchment-dim">{t('unlock.body')}</p>

        <label class="mt-6 block">
          <span class="mb-1.5 block text-ui text-parchment-dim">{t('unlock.token')}</span>
          <input
            // Autofocus is the point: it is the one thing this screen asks for.
            autofocus
            name="token"
            value={token()}
            onInput={(event) => setToken(event.target.value)}
            placeholder={t('unlock.tokenPlaceholder')}
            class={`w-full px-3 py-2 font-mono text-code text-parchment ${FIELD_FRAME}`}
          />
        </label>

        <Show when={error() !== ''}>
          <p class="mt-2 text-ui text-danger">{error()}</p>
        </Show>

        <button
          type="submit"
          disabled={busy() || token().trim() === ''}
          class={`mt-6 w-full justify-center ${PRIMARY_ACTION}`}
        >
          {t(busy() ? 'unlock.opening' : 'unlock.submit')}
        </button>
      </form>
    </div>
  )
}
