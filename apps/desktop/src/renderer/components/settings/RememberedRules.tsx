import { type PermissionRule, ruleScopeKey, toolRiskOf } from '@alpha/core'
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { bridge } from '../../lib/bridge.ts'
import { useText } from '../../stores/shell.ts'
import { GROUP_LABEL } from '../controls.ts'

/**
 * The rules the user has stopped wanting to be asked about. They are listed here so they can be
 * revoked: a remembered decision that cannot be found again is a permission nobody remembers
 * granting.
 */
export function RememberedRules() {
  const t = useText()
  const [rules, setRules] = createSignal<PermissionRule[]>([])
  const [busy, setBusy] = createSignal('')

  onMount(() => {
    void bridge().permissionRules().then(setRules)
    onCleanup(bridge().onPermissionRules(setRules))
  })

  const revoke = async (ruleId: string) => {
    setBusy(ruleId)
    try {
      setRules(await bridge().revokePermissionRule(ruleId))
    } finally {
      setBusy('')
    }
  }

  return (
    <section aria-labelledby="settings-rules">
      <h2 id="settings-rules" class={GROUP_LABEL}>
        {t('settings.remembered')}
      </h2>
      <p class="mt-1 max-w-measure text-xs text-parchment-dim">
        {t(rules().length === 0 ? 'settings.remembered.none' : 'settings.remembered.some')}
      </p>

      <Show when={rules().length > 0}>
        <ul class="mt-3 space-y-1.5">
          <For each={rules()}>
            {(rule) => (
              <li class="flex items-center gap-3 rounded-control border border-line bg-ink-800 px-3 py-2">
                <span class="shrink-0 font-mono text-xs text-parchment">{rule.toolName}</span>
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-parchment-dim" title={rule.pattern}>
                  {rule.pattern === '' ? t('settings.anyPattern') : rule.pattern}
                </span>
                <span class="shrink-0 font-mono text-micro text-parchment-faint">
                  {t(ruleScopeKey(rule.scope))} · {toolRiskOf(rule.toolName)}
                </span>
                <button
                  type="button"
                  aria-label={t('settings.revoke', { tool: rule.toolName, pattern: rule.pattern })}
                  onClick={() => void revoke(rule.id)}
                  disabled={busy() === rule.id}
                  class="shrink-0 rounded-control border border-line px-2 py-0.5 text-micro text-parchment-dim transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                >
                  {t('settings.revokeAction')}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}
