import { THEMES, type Theme } from '@alpha/core'
import { useShell } from '../../stores/shell.ts'

const THEME_LABELS: Record<Theme, string> = { system: 'Follow the system', dark: 'Dark', light: 'Light' }

/** Dark, light, or whatever the machine says. */
export function AppearanceSection() {
  const theme = useShell((state) => state.theme)
  const setTheme = useShell((state) => state.setTheme)

  return (
    <section>
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
