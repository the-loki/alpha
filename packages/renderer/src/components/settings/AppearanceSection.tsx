import { ACCENTS, type Accent, THEMES, type Theme } from '@alpha/core'
import { useShell } from '../../stores/shell.ts'
import { CheckIcon } from '../icons.tsx'

const THEME_LABELS: Record<Theme, string> = { system: 'Follow the system', dark: 'Dark', light: 'Light' }

const ACCENT_LABELS: Record<Accent, string> = {
  ember: 'Ember',
  sage: 'Sage',
  iris: 'Iris',
  rose: 'Rose',
  plum: 'Plum',
}

/** Which palette, and which colour the workbench is drawn in. */
export function AppearanceSection() {
  const theme = useShell((state) => state.theme)
  const accent = useShell((state) => state.accent)
  const setAppearance = useShell((state) => state.setAppearance)

  return (
    <>
      <section>
        <h2 className="text-body font-medium text-parchment">Theme</h2>
        <p className="mt-1 text-xs text-parchment-dim">
          Light is what a new workbench opens on. The dark palette is its own set of colours rather than an inversion,
          and following the system switches between the two as the machine does.
        </p>
        <div className="mt-3 flex gap-2">
          {THEMES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === theme}
              onClick={() => void setAppearance({ theme: candidate })}
              className={`rounded-control border px-3 py-1.5 text-xs transition-colors ${
                candidate === theme
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-line text-parchment-dim hover:bg-ink-600'
              }`}
            >
              {candidate === theme && <CheckIcon />}
              {THEME_LABELS[candidate]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-body font-medium text-parchment">Accent</h2>
        <p className="mt-1 text-xs text-parchment-dim">
          The colour of the streaming answer, the focus ring and the primary action. Every one is measured against both
          palettes, so none of them is legible in only one.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ACCENTS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={candidate === accent}
              onClick={() => void setAppearance({ accent: candidate })}
              className={`flex items-center gap-2 rounded-control border py-1.5 pr-3 pl-2 text-xs transition-colors ${
                candidate === accent
                  ? 'border-line-strong bg-ink-600 font-medium text-parchment'
                  : 'border-line text-parchment-dim hover:bg-ink-600'
              }`}
            >
              {/* The swatch wears the accent it names, in the mode the workbench is in, so the
                  choice shows what it changes instead of describing it. */}
              <span
                aria-hidden="true"
                data-accent-swatch={candidate}
                data-accent={candidate}
                className="h-3.5 w-3.5 rounded-full border border-line-strong/40 bg-accent"
              />
              {ACCENT_LABELS[candidate]}
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
