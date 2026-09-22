import { createSignal, Show } from 'solid-js'
import { rememberedToken } from '../lib/network-bridge.ts'
import { shellActions, useText } from '../stores/shell.ts'
import { CONTROL_HEIGHT, FIELD_FRAME, GROUP_LABEL, PRIMARY_ACTION } from './controls.ts'
import { WindowCorner } from './WindowCorner.tsx'

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
    <div class="relative grid h-screen place-items-center bg-surface-0 px-6">
      {/* Every screen without a view head keeps the window's three in a corner of its own (C5.4). */}
      <WindowCorner />
      <form
        class="w-full max-w-md rounded-xl border border-line bg-surface-3 p-8 shadow-high"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {/* The one screen that is not the workbench still names whose window it is: the app's name
            in the apparatus voice, in the same place every screen keeps it. */}
        <span class="flex items-center gap-2">
          <span class="font-mono text-label tracking-[0.2em] text-muted">ALPHA</span>
        </span>
        <h1 class="mt-6 font-text text-display text-foreground">{t('unlock.title')}</h1>
        <p class="mt-2 max-w-measure font-text text-body text-muted">{t('unlock.body')}</p>

        <label class="mt-6 block">
          <span class={`mb-1.5 block ${GROUP_LABEL}`}>{t('unlock.token')}</span>
          <input
            // Autofocus is the point: it is the one thing this screen asks for.
            autofocus
            name="token"
            value={token()}
            onInput={(event) => setToken(event.target.value)}
            placeholder={t('unlock.tokenPlaceholder')}
            class={`w-full px-2 font-mono text-code ${CONTROL_HEIGHT} ${FIELD_FRAME}`}
          />
        </label>

        <Show when={error() !== ''}>
          <p class="mt-2 max-w-measure font-text text-name text-danger">{error()}</p>
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
