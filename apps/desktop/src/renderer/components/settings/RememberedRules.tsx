import { type PermissionRule, ruleScopeKey, toolRiskOf } from '@alpha/domain'
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { bridge } from '../../lib/bridge.ts'
import { useText } from '../../stores/shell.ts'
import { DESTRUCTIVE_ACTION, GROUP_LABEL } from '../controls.ts'

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
      <p class="mt-1 max-w-measure font-text text-name leading-relaxed text-muted">
        {t(rules().length === 0 ? 'settings.remembered.none' : 'settings.remembered.some')}
      </p>

      <Show when={rules().length > 0}>
        <ul class="mt-3 space-y-1.5">
          <For each={rules()}>
            {(rule) => (
              <li class="flex items-center gap-3 rounded-md border border-line bg-surface-0 px-4 py-3">
                <span class="shrink-0 font-mono text-xs text-foreground">{rule.toolName}</span>
                <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={rule.pattern}>
                  {rule.pattern === '' ? t('settings.anyPattern') : rule.pattern}
                </span>
                <span class="shrink-0 font-mono text-label text-faint">
                  {t(ruleScopeKey(rule.scope))} · {toolRiskOf(rule.toolName)}
                </span>
                <button
                  type="button"
                  aria-label={t('settings.revoke', { tool: rule.toolName, pattern: rule.pattern })}
                  onClick={() => void revoke(rule.id)}
                  disabled={busy() === rule.id}
                  class={`shrink-0 ${DESTRUCTIVE_ACTION}`}
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
