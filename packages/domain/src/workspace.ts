/**
 * Workspace selection: which folder the composer is pointed at, and the folders the workbench
 * remembers. Persisted by the main process; the rules live here so they are testable without a
 * filesystem.
 */

import type { Undef } from './maybe.ts'

export const RECENTS_LIMIT = 5

export interface WorkspaceRef {
  path: string
  name: string
  lastOpenedAt: number
}

export type WorkspaceSelection = { kind: 'none' } | { kind: 'selected'; workspace: WorkspaceRef }

export interface WorkspaceState {
  selection: WorkspaceSelection
  recents: WorkspaceRef[]
}

export function emptyWorkspaceState(): WorkspaceState {
  return { selection: { kind: 'none' }, recents: [] }
}

/** The label a folder is shown under: its last segment, whatever the platform. */
export function folderName(path: string): string {
  const withoutTrailingSeparator = path.replace(/[/\\]+$/, '')
  const segments = withoutTrailingSeparator.split(/[/\\]/)
  const name = segments[segments.length - 1]
  return name === '' ? withoutTrailingSeparator : name
}

export function workspaceFromPath(path: string, now: number): WorkspaceRef {
  const withoutTrailingSeparator = path.replace(/[/\\]+$/, '')
  return { path: withoutTrailingSeparator, name: folderName(withoutTrailingSeparator), lastOpenedAt: now }
}

/**
 * Which folder the composer's next message belongs to. The selection answers it whenever there is
 * one; a workbench that remembers folders but was never pointed at one still points at the most
 * recently used, because a composer with folders to work in and no way to say which would be a
 * dead end.
 */
export function composerFolder(state: WorkspaceState): Undef<WorkspaceRef> {
  if (state.selection.kind === 'selected') return state.selection.workspace
  return state.recents[0]
}

export function rememberWorkspace(state: WorkspaceState, workspace: WorkspaceRef): WorkspaceState {
  const others = state.recents.filter((recent) => recent.path !== workspace.path)
  return {
    selection: { kind: 'selected', workspace },
    recents: [workspace, ...others].slice(0, RECENTS_LIMIT),
  }
}
