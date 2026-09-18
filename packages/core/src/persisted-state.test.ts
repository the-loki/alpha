import { describe, expect, it } from 'vitest'
import { emptyPersistedState, type PersistedState, parsePersistedState } from './persisted-state.ts'

const valid = {
  workspace: {
    selection: { kind: 'selected', workspace: { path: '/dev/alpha', name: 'alpha', lastOpenedAt: 12 } },
    recents: [{ path: '/dev/alpha', name: 'alpha', lastOpenedAt: 12 }],
  },
  permissionLevel: 'accept-edits',
}

describe('emptyPersistedState', () => {
  it('has nothing selected and the default level', () => {
    const state = emptyPersistedState()
    expect(state.workspace.selection.kind).toBe('none')
    expect(state.workspace.recents).toEqual([])
    expect(state.permissionLevel).toBe('ask')
  })
})

describe('parsePersistedState', () => {
  it('round-trips a valid state', () => {
    expect(parsePersistedState(JSON.parse(JSON.stringify(valid)))).toEqual(valid)
  })

  it('falls back to empty for a non-object', () => {
    expect(parsePersistedState('nonsense')).toEqual(emptyPersistedState())
  })

  it('falls back to empty for null', () => {
    expect(parsePersistedState(null)).toEqual(emptyPersistedState())
  })

  it('falls back to empty when the level is not a level', () => {
    const broken = { ...valid, permissionLevel: 'yolo' }
    expect(parsePersistedState(broken)).toEqual(emptyPersistedState())
  })

  it('falls back to empty when a recent is malformed', () => {
    const broken = { ...valid, workspace: { ...valid.workspace, recents: [{ path: 1 }] } }
    expect(parsePersistedState(broken)).toEqual(emptyPersistedState())
  })

  it('falls back to empty when the selection names nothing', () => {
    const broken = { ...valid, workspace: { ...valid.workspace, selection: { kind: 'selected' } } }
    expect(parsePersistedState(broken)).toEqual(emptyPersistedState())
  })

  it('accepts a state with no workspace chosen yet', () => {
    const fresh: PersistedState = { workspace: { selection: { kind: 'none' }, recents: [] }, permissionLevel: 'plan' }
    expect(parsePersistedState(fresh)).toEqual(fresh)
  })

  it('survives a file that was truncated mid-write', () => {
    expect(parsePersistedState('{"workspace":{"selection":{"kind":"no')).toEqual(emptyPersistedState())
  })

  it('parses a valid file that arrives as text', () => {
    expect(parsePersistedState(JSON.stringify(valid))).toEqual(valid)
  })
})
