import type { WorkspaceRef } from '@alpha/core'
import { useEffect, useRef, useState } from 'react'
import { useShell } from '../stores/shell.ts'

/**
 * Where the agent is pointed, and the folders it was pointed at before. The list is what the
 * workbench remembers, so this is the one place a workspace changes without a native dialog.
 */
export function WorkspaceButton() {
  const workspace = useShell((state) => state.workspace)
  const recents = useShell((state) => state.recents)
  const pickWorkspace = useShell((state) => state.pickWorkspace)
  const openRecent = useShell((state) => state.openRecent)
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

  const selected = workspace.kind === 'selected'
  const current = selected ? workspace.workspace.path : ''
  const elsewhere = recents.filter((recent) => recent.path !== current)

  const choose = (path: string) => {
    setOpen(false)
    void openRecent(path)
  }

  return (
    <div className="relative no-drag" ref={container}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={selected ? workspace.workspace.path : 'Choose a folder for the agent to work in'}
        onClick={() => setOpen((value) => !value)}
        className="w-full rounded-card border border-line bg-ink-700 px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-ink-600"
      >
        <span className="block truncate text-ui font-medium text-parchment">
          {selected ? workspace.workspace.name : 'Open a folder'}
        </span>
        <span className="mt-0.5 block truncate font-mono text-micro text-parchment-faint">
          {selected ? workspace.workspace.path : 'No workspace yet'}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Workspaces"
          className="absolute left-0 z-50 mt-1 w-full min-w-56 overflow-hidden rounded-overlay border border-line bg-ink-800 py-1 shadow-xl shadow-black/40"
        >
          {elsewhere.map((recent: WorkspaceRef) => (
            <button
              key={recent.path}
              type="button"
              role="menuitem"
              onClick={() => choose(recent.path)}
              className="block w-full px-3 py-1.5 text-left transition-colors hover:bg-ink-600"
            >
              <span className="block truncate text-code text-parchment">{recent.name}</span>
              <span className="block truncate font-mono text-micro text-parchment-faint">{recent.path}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void pickWorkspace()
            }}
            className="mt-1 block w-full border-t border-line px-3 pt-2 pb-1.5 text-left text-xs text-parchment-dim transition-colors hover:text-parchment"
          >
            Open another folder…
          </button>
        </div>
      )}
    </div>
  )
}
