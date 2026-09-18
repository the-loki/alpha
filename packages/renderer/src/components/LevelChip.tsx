import { levelDescription, levelLabel, levelTone, PERMISSION_LEVELS, type PermissionLevel } from '@alpha/core'
import { useEffect, useRef, useState } from 'react'
import { useShell } from '../stores/shell.ts'

const TONE_CLASS: Record<string, string> = {
  info: 'text-info border-info/40 bg-info/10',
  amber: 'text-amber border-amber/40 bg-amber/10',
  jade: 'text-jade border-jade/40 bg-jade/10',
  ember: 'text-ember border-ember/40 bg-ember/10',
}

const DOT_CLASS: Record<string, string> = {
  info: 'bg-info',
  amber: 'bg-amber',
  jade: 'bg-jade',
  ember: 'bg-ember',
}

/**
 * The permission level, always visible. Colour distinguishes the levels, but the label is what
 * carries the meaning, so the chip still reads for someone who cannot tell ember from jade.
 */
export function LevelChip() {
  const level = useShell((state) => state.permissionLevel)
  const setPermissionLevel = useShell((state) => state.setPermissionLevel)
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const tone = levelTone(level)
  return (
    <div className="relative no-drag" ref={container}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={levelDescription(level)}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-2 rounded-control border px-2.5 py-1 text-[12px] font-medium transition-colors ${TONE_CLASS[tone]}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[tone]}`} aria-hidden="true" />
        {levelLabel(level)}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Permission level"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-overlay border border-line bg-ink-800 py-1 shadow-xl shadow-black/40"
        >
          {PERMISSION_LEVELS.map((candidate: PermissionLevel) => (
            <button
              key={candidate}
              type="button"
              role="menuitemradio"
              aria-checked={candidate === level}
              onClick={() => {
                void setPermissionLevel(candidate)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left transition-colors hover:bg-ink-600"
            >
              <span className="flex items-center gap-2 text-[13px] text-parchment">
                <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[levelTone(candidate)]}`} aria-hidden="true" />
                {levelLabel(candidate)}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-parchment-faint">
                {levelDescription(candidate)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
