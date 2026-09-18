import { describe, expect, it } from 'vitest'
import { emptyPersistedState, type PersistedState, parsePersistedState } from './persisted-state.ts'

const rule = {
  id: 'r1',
  scope: 'workspace',
  conversationId: '',
  toolName: 'bash',
  pattern: 'pnpm test',
  createdAt: 12,
}

const valid = {
  workspace: {
    selection: { kind: 'selected', workspace: { path: '/dev/alpha', name: 'alpha', lastOpenedAt: 12 } },
    recents: [{ path: '/dev/alpha', name: 'alpha', lastOpenedAt: 12 }],
  },
  permissionLevel: 'accept-edits',
  permissionRules: [rule],
}

describe('emptyPersistedState', () => {
  it('has nothing selected, the default level, and no remembered rules', () => {
    const state = emptyPersistedState()
    expect(state.workspace.selection.kind).toBe('none')
    expect(state.workspace.recents).toEqual([])
    expect(state.permissionLevel).toBe('ask')
    expect(state.permissionRules).toEqual([])
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
    const fresh: PersistedState = {
      workspace: { selection: { kind: 'none' }, recents: [] },
      permissionLevel: 'plan',
      permissionRules: [],
    }
    expect(parsePersistedState(fresh)).toEqual(fresh)
  })

  it('keeps the remembered rules it can read', () => {
    expect(parsePersistedState(JSON.parse(JSON.stringify(valid))).permissionRules).toEqual([rule])
  })

  it('has no rules when the file predates them', () => {
    const older = { workspace: valid.workspace, permissionLevel: 'ask' }
    expect(parsePersistedState(older).permissionRules).toEqual([])
  })

  it('drops a rule it cannot read without losing the ones it can, or the workspace', () => {
    const broken = { ...valid, permissionRules: [rule, { id: 'r2', scope: 'everywhere' }, 'nonsense'] }
    const state = parsePersistedState(broken)
    expect(state.permissionRules).toEqual([rule])
    expect(state.workspace.selection.kind).toBe('selected')
  })

  it('has no rules when the rules are not a list', () => {
    expect(parsePersistedState({ ...valid, permissionRules: 'all of them' }).permissionRules).toEqual([])
  })

  it('survives a file that was truncated mid-write', () => {
    expect(parsePersistedState('{"workspace":{"selection":{"kind":"no')).toEqual(emptyPersistedState())
  })

  it('parses a valid file that arrives as text', () => {
    expect(parsePersistedState(JSON.stringify(valid))).toEqual(valid)
  })
})
