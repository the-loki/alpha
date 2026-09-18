/**
 * Workspace selection: which folder the workbench is pointed at, and the short list of
 * folders it was pointed at before. Persisted by the main process; the rules live here so
 * they are testable without a filesystem.
 */

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

export function workspaceFromPath(path: string, now: number): WorkspaceRef {
  const withoutTrailingSeparator = path.replace(/[/\\]+$/, '')
  const segments = withoutTrailingSeparator.split(/[/\\]/)
  const name = segments[segments.length - 1]
  return { path: withoutTrailingSeparator, name: name === '' ? withoutTrailingSeparator : name, lastOpenedAt: now }
}

export function rememberWorkspace(state: WorkspaceState, workspace: WorkspaceRef): WorkspaceState {
  const others = state.recents.filter((recent) => recent.path !== workspace.path)
  return {
    selection: { kind: 'selected', workspace },
    recents: [workspace, ...others].slice(0, RECENTS_LIMIT),
  }
}
