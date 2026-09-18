import { levelDescription, levelLabel, levelTone, PERMISSION_LEVELS, THEMES, type Theme } from '@alpha/core'
import { createFileRoute } from '@tanstack/react-router'
import { TONE_CLASS } from '../components/LevelChip.tsx'
import { ProvidersSection } from '../components/settings/ProvidersSection.tsx'
import { RememberedRules } from '../components/settings/RememberedRules.tsx'
import { useShell } from '../stores/shell.ts'

function PermissionSection() {
  const level = useShell((state) => state.workspaceLevel)
  const setPermissionLevel = useShell((state) => state.setPermissionLevel)

  return (
    <section className="mt-8">
      <h2 className="text-body font-medium text-parchment">Default permission level</h2>
      <p className="mt-1 text-xs text-parchment-dim">
        New conversations in this workspace start here. An open conversation keeps its own level — change that from the
        chip in the header.
      </p>
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
              <span className="block text-ui font-medium">{levelLabel(candidate)}</span>
              <span className="mt-0.5 block text-xs text-parchment-faint">{levelDescription(candidate)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const THEME_LABELS: Record<Theme, string> = { system: 'Follow the system', dark: 'Dark', light: 'Light' }

function ThemeSection() {
  const theme = useShell((state) => state.theme)
  const setTheme = useShell((state) => state.setTheme)

  return (
    <section className="mt-8">
      <h2 className="text-body font-medium text-parchment">Theme</h2>
      <p className="mt-1 text-xs text-parchment-dim">
        Alpha follows the system by default. The light theme is its own palette, not a filter over the dark one.
      </p>
      <div className="mt-3 flex gap-1.5">
        {THEMES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={candidate === theme}
            onClick={() => void setTheme(candidate)}
            className={`rounded-control border px-3 py-1.5 text-xs transition-colors ${
              candidate === theme
                ? 'border-ember/50 bg-ember/10 text-ember'
                : 'border-line text-parchment-dim hover:bg-ink-700'
            }`}
          >
            {THEME_LABELS[candidate]}
          </button>
        ))}
      </div>
    </section>
  )
}

function Settings() {
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-medium text-parchment">Settings</h1>
        <ProvidersSection />
        <PermissionSection />
        <ThemeSection />
        <RememberedRules />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings')({ component: Settings })
