import { describe, expect, it } from 'vitest'
import {
  emptyWorkspaceState,
  RECENTS_LIMIT,
  rememberWorkspace,
  type WorkspaceRef,
  workspaceFromPath,
} from './workspace.ts'

const at = (path: string, lastOpenedAt = 0): WorkspaceRef => ({
  path,
  name: path.split('/').pop() ?? path,
  lastOpenedAt,
})

describe('[core] workspaceFromPath', () => {
  it('names a workspace after its folder', () => {
    expect(workspaceFromPath('/home/dev/alpha', 100).name).toBe('alpha')
  })

  it('ignores a trailing separator', () => {
    expect(workspaceFromPath('/home/dev/alpha/', 100).name).toBe('alpha')
  })

  it('keeps the absolute path it was given', () => {
    expect(workspaceFromPath('/home/dev/alpha', 100).path).toBe('/home/dev/alpha')
  })
})

describe('[core] rememberWorkspace', () => {
  it('starts from an empty state with nothing selected', () => {
    expect(emptyWorkspaceState().selection.kind).toBe('none')
  })

  it('selects the workspace it is given', () => {
    const state = rememberWorkspace(emptyWorkspaceState(), at('/dev/alpha', 1))
    expect(state.selection).toEqual({ kind: 'selected', workspace: at('/dev/alpha', 1) })
  })

  it('puts the most recent workspace first', () => {
    let state = rememberWorkspace(emptyWorkspaceState(), at('/dev/alpha', 1))
    state = rememberWorkspace(state, at('/dev/beta', 2))
    expect(state.recents.map((w) => w.name)).toEqual(['beta', 'alpha'])
  })

  it('moves a revisited workspace back to the front instead of duplicating it', () => {
    let state = rememberWorkspace(emptyWorkspaceState(), at('/dev/alpha', 1))
    state = rememberWorkspace(state, at('/dev/beta', 2))
    state = rememberWorkspace(state, at('/dev/alpha', 3))
    expect(state.recents.map((w) => w.path)).toEqual(['/dev/alpha', '/dev/beta'])
  })

  it('keeps the newer timestamp when a workspace is revisited', () => {
    let state = rememberWorkspace(emptyWorkspaceState(), at('/dev/alpha', 1))
    state = rememberWorkspace(state, at('/dev/alpha', 9))
    expect(state.recents[0].lastOpenedAt).toBe(9)
  })

  it('keeps at most five recents, dropping the oldest', () => {
    let state = emptyWorkspaceState()
    for (let index = 1; index <= 7; index += 1) {
      state = rememberWorkspace(state, at(`/dev/w${index}`, index))
    }
    expect(state.recents).toHaveLength(RECENTS_LIMIT)
    expect(state.recents.map((w) => w.name)).toEqual(['w7', 'w6', 'w5', 'w4', 'w3'])
  })
})
