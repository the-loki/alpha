import { levelDescription, levelLabel, levelTone, PERMISSION_LEVELS } from '@alpha/core'
import { createFileRoute } from '@tanstack/react-router'
import { ProvidersSection } from '../components/settings/ProvidersSection.tsx'
import { RememberedRules } from '../components/settings/RememberedRules.tsx'
import { useShell } from '../stores/shell.ts'

const TONE_CLASS: Record<string, string> = {
  info: 'border-info/40 bg-info/10 text-info',
  amber: 'border-amber/40 bg-amber/10 text-amber',
  jade: 'border-jade/40 bg-jade/10 text-jade',
  ember: 'border-ember/40 bg-ember/10 text-ember',
}

function PermissionSection() {
  const level = useShell((state) => state.permissionLevel)
  const setPermissionLevel = useShell((state) => state.setPermissionLevel)

  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-medium text-parchment">Default permission level</h2>
      <p className="mt-1 text-[12px] text-parchment-dim">New conversations in this workspace start at this level.</p>
      <ul className="mt-3 space-y-1.5">
        {PERMISSION_LEVELS.map((candidate) => (
          <li key={candidate}>
            <button
              type="button"
              aria-pressed={candidate === level}
              onClick={() => void setPermissionLevel(candidate)}
              className={`w-full rounded-card border px-3 py-2.5 text-left transition-colors hover:bg-ink-700 ${
                candidate === level ? TONE_CLASS[levelTone(candidate)] : 'border-line text-parchment-dim'
              }`}
            >
              <span className="block text-[13px] font-medium">{levelLabel(candidate)}</span>
              <span className="mt-0.5 block text-[12px] text-parchment-faint">{levelDescription(candidate)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Settings() {
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-[20px] font-medium text-parchment">Settings</h1>
        <ProvidersSection />
        <PermissionSection />
        <RememberedRules />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings')({ component: Settings })
