import { type PermissionRule, ruleScopeLabel, toolRiskOf } from '@alpha/core'
import { useEffect, useState } from 'react'
import { bridge } from '../../lib/bridge.ts'

/**
 * The rules the user has stopped wanting to be asked about. They are listed here so they can be
 * revoked: a remembered decision that cannot be found again is a permission nobody remembers
 * granting.
 */
export function RememberedRules() {
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [busy, setBusy] = useState('')

  useEffect(() => {
    void bridge().permissionRules().then(setRules)
    return bridge().onPermissionRules(setRules)
  }, [])

  const revoke = async (ruleId: string) => {
    setBusy(ruleId)
    try {
      setRules(await bridge().revokePermissionRule(ruleId))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-medium text-parchment">Remembered approvals</h2>
      <p className="mt-1 text-[12px] text-parchment-dim">
        {rules.length === 0
          ? 'Nothing is remembered yet. "Always allow" on a card adds a rule here.'
          : 'These calls run without asking. Revoking one makes the next matching call ask again.'}
      </p>

      {rules.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center gap-3 rounded-card border border-line bg-ink-800/60 px-3 py-2"
            >
              <span className="shrink-0 font-mono text-[12px] text-parchment">{rule.toolName}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-parchment-dim" title={rule.pattern}>
                {rule.pattern === '' ? '(anything)' : rule.pattern}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-parchment-faint">
                {ruleScopeLabel(rule.scope)} · {toolRiskOf(rule.toolName)}
              </span>
              <button
                type="button"
                aria-label={`Revoke the ${rule.toolName} rule for ${rule.pattern}`}
                onClick={() => void revoke(rule.id)}
                disabled={busy === rule.id}
                className="shrink-0 rounded-control border border-line px-2 py-0.5 text-[11px] text-parchment-dim transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
