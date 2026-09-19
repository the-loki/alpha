import { levelDescription, levelLabel, levelTone, PERMISSION_LEVELS } from '@alpha/core'
import { useShell } from '../../stores/shell.ts'
import { CheckIcon } from '../icons.tsx'
import { TONE_CLASS } from '../LevelChip.tsx'

/** The level a new conversation in this workspace starts at. */
export function PermissionSection() {
  const level = useShell((state) => state.workspaceLevel)
  const setPermissionLevel = useShell((state) => state.setPermissionLevel)

  return (
    <section aria-labelledby="settings-level">
      <h2 id="settings-level" className="text-body font-medium text-parchment">
        Default permission level
      </h2>
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
              className={`flex w-full items-start gap-3 rounded-card border px-3 py-2.5 text-left transition-colors hover:bg-ink-700 ${
                candidate === level ? TONE_CLASS[levelTone(candidate)] : 'border-line text-parchment-dim'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-ui font-medium">{levelLabel(candidate)}</span>
                <span className="mt-0.5 block text-xs text-parchment-faint">{levelDescription(candidate)}</span>
              </span>
              {/* The chosen level is marked, not only tinted: the tints are the level's own colours
                  and someone who cannot tell them apart still has to see which one is on. */}
              {candidate === level && <CheckIcon className="mt-0.5 text-current" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
