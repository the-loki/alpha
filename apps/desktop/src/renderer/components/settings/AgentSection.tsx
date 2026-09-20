import { agentStatusKey, PI_MINIMUM_VERSION, type Undef } from '@alpha/core'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { bridge } from '../../lib/bridge.ts'
import { agent, agentActions, agentReady } from '../../stores/agent.ts'
import { useText } from '../../stores/shell.ts'
import { ACCENT_ACTION, CONTROL_HEIGHT, OUTLINED_ACTION } from '../controls.ts'

/**
 * The agent Alpha runs: none of its own, so this panel is the whole relationship with pi until a
 * conversation is opened. It says what Alpha found (or did not), takes a path from anyone whose pi
 * is somewhere unusual, offers the install command — to run here, or to copy and run yourself —
 * and shows what the install printed while it prints it.
 */
export function AgentSection() {
  const t = useText()
  const [typed, setTyped] = createSignal<Undef<string>>(undefined)
  const [copied, setCopied] = createSignal(false)

  // The panel opens on the truth rather than on an assumption, and follows what main pushes:
  // an install started from another client is watched here too.
  onMount(() => {
    void agentActions.refresh()
    onCleanup(bridge().onAgentChanged(agentActions.apply))
  })

  return (
    <Show when={agent.snapshot}>
      {(snapshot) => {
        // Whatever the sentence needs: the search's answer already carries it.
        const values = (): Record<string, string | number> => {
          const { status } = snapshot()
          return {
            path: 'path' in status ? status.path : '',
            version: 'version' in status ? status.version : '',
            needed: PI_MINIMUM_VERSION,
            reason: status.kind === 'unusable' ? status.reason : '',
          }
        }

        return (
          <section aria-label={t('settings.tabAgent')}>
            <div class="mt-3 space-y-3 rounded-card border border-line bg-ink-800 p-4">
              <p class="text-ui text-parchment">{t(agentStatusKey(snapshot().status), values())}</p>

              <div class="space-y-1">
                <label class="block text-xs text-parchment-dim" for="agent-path">
                  {t('agent.path')}
                </label>
                <input
                  id="agent-path"
                  value={typed() ?? snapshot().path}
                  placeholder="pi"
                  spellcheck={false}
                  onInput={(event) => setTyped(event.target.value)}
                  onBlur={() => {
                    void agentActions.setPath(typed() ?? snapshot().path)
                    setTyped(undefined)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    void agentActions.setPath(typed() ?? snapshot().path)
                    setTyped(undefined)
                  }}
                  class={`w-full rounded-control border border-line bg-ink-700 px-3 font-mono text-xs text-parchment ${CONTROL_HEIGHT}`}
                />
                <p class="max-w-measure text-xs text-parchment-faint">{t('agent.pathHint')}</p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={snapshot().installing}
                  onClick={() => void agentActions.install()}
                  class={ACCENT_ACTION}
                >
                  {snapshot().installing ? t('agent.installing') : t('agent.install')}
                </button>
                <button type="button" onClick={() => void agentActions.refresh()} class={OUTLINED_ACTION}>
                  {t('agent.recheck')}
                </button>
              </div>

              <div class="space-y-1">
                <span class="block text-xs text-parchment-dim">{t('agent.command')}</span>
                <div class="flex items-center gap-2">
                  <code class="flex h-7 grow items-center truncate rounded-control border border-line bg-ink-700 px-2 font-mono text-xs text-parchment-faint">
                    {snapshot().command}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(snapshot().command)
                      setCopied(true)
                    }}
                    class={OUTLINED_ACTION}
                  >
                    {copied() ? t('agent.copied') : t('agent.copy')}
                  </button>
                </div>
              </div>

              <Show when={snapshot().output !== ''}>
                <div class="space-y-1">
                  <span class="block text-xs text-parchment-dim">{t('agent.output')}</span>
                  <pre class="max-h-48 overflow-auto rounded-control border border-line bg-ink-900 p-2 font-mono text-xs text-parchment-faint">
                    {snapshot().output}
                  </pre>
                  <Show when={!snapshot().installing && !agentReady(snapshot())}>
                    <p class="text-xs text-ember-300">{t('agent.failed')}</p>
                  </Show>
                </div>
              </Show>
            </div>
          </section>
        )
      }}
    </Show>
  )
}
