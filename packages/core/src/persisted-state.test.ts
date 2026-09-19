import { describe, expect, it } from 'vitest'
import {
  defaultLevelFor,
  emptyNetworkAccess,
  emptyPersistedState,
  type PersistedState,
  parsePersistedState,
} from './persisted-state.ts'

const rule = {
  id: 'r1',
  scope: 'workspace',
  conversationId: '',
  workspacePath: '/dev/alpha',
  toolName: 'bash',
  pattern: 'pnpm test',
  createdAt: 12,
}

const valid = {
  theme: 'system',
  accent: 'sage',
  language: 'zh',
  workspaceLevels: {},
  workspace: {
    selection: { kind: 'selected', workspace: { path: '/dev/alpha', name: 'alpha', lastOpenedAt: 12 } },
    recents: [{ path: '/dev/alpha', name: 'alpha', lastOpenedAt: 12 }],
  },
  permissionLevel: 'accept-edits',
  permissionRules: [rule],
  lastConversationId: 'c1',
  network: { enabled: true, port: 4123, bind: 'network', token: 'a-token-kept-across-launches' },
}

describe('[core] emptyPersistedState', () => {
  it('has nothing selected, the default level, no remembered rules, and the default look', () => {
    const state = emptyPersistedState()
    expect(state.workspace.selection.kind).toBe('none')
    expect(state.workspace.recents).toEqual([])
    expect(state.permissionLevel).toBe('ask')
    expect(state.permissionRules).toEqual([])
    // A fresh install opens light, in the accent the app is named after (C5.2).
    expect(state.theme).toBe('light')
    expect(state.accent).toBe('ember')
    // And in the language of the machine it is opened on.
    expect(state.language).toBe('system')
    // Browser access is off until it is asked for, and it listens only to this machine (C6.1, C6.2).
    expect(state.network).toEqual({ enabled: false, port: 4123, bind: 'local', token: '' })
  })

  it('gives a file written before browser access existed the off default', () => {
    const { network: _dropped, ...older } = valid
    expect(parsePersistedState(older).network).toEqual(emptyNetworkAccess())
  })

  it('keeps the network settings it can read, and the defaults for the rest', () => {
    const broken = { ...valid, network: { enabled: 'yes', port: -1, bind: 'everywhere', token: 7 } }
    expect(parsePersistedState(broken).network).toEqual(emptyNetworkAccess())
  })
})

describe('[core] parsePersistedState', () => {
  it('round-trips a valid state', () => {
    expect(parsePersistedState(JSON.parse(JSON.stringify(valid)))).toEqual(valid)
  })

  it('remembers which conversation was open, and nothing when none was', () => {
    expect(parsePersistedState(JSON.parse(JSON.stringify(valid))).lastConversationId).toBe('c1')
    const { lastConversationId: _dropped, ...without } = valid
    expect(parsePersistedState(without).lastConversationId).toBe('')
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
      workspaceLevels: { '/dev/alpha': 'full-access' },
      permissionRules: [],
      theme: 'light',
      accent: 'ember',
      language: 'system',
      lastConversationId: '',
      network: emptyNetworkAccess(),
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

  it('gives a workspace its own default level, and the general one where it has none', () => {
    const state = parsePersistedState({ ...valid, permissionLevel: 'ask', workspaceLevels: { '/dev/beta': 'plan' } })
    expect(defaultLevelFor(state, '/dev/beta')).toBe('plan')
    expect(defaultLevelFor(state, '/dev/gamma')).toBe('ask')
  })

  it('drops a default that is not a level, and keeps the rest', () => {
    const state = parsePersistedState({ ...valid, workspaceLevels: { '/dev/beta': 'yolo', '/dev/good': 'plan' } })
    expect(state.workspaceLevels).toEqual({ '/dev/good': 'plan' })
  })

  it('opens light when the file predates the theme choice, and keeps what it does say', () => {
    const older = { workspace: valid.workspace, permissionLevel: 'ask' }
    expect(parsePersistedState(older).theme).toBe('light')
  })

  it('keeps a chosen theme', () => {
    expect(parsePersistedState({ ...valid, theme: 'light' }).theme).toBe('light')
  })

  it('follows the machine when the file predates the language choice', () => {
    const older = { workspace: valid.workspace, permissionLevel: 'ask' }
    expect(parsePersistedState(older).language).toBe('system')
  })

  it('keeps a chosen language', () => {
    expect(parsePersistedState({ ...valid, language: 'en' }).language).toBe('en')
    expect(parsePersistedState(valid).language).toBe('zh')
  })

  it('falls back to following the system when the theme is not one', () => {
    expect(parsePersistedState({ ...valid, theme: 'midnight' })).toEqual(emptyPersistedState())
  })

  it('survives a file that was truncated mid-write', () => {
    expect(parsePersistedState('{"workspace":{"selection":{"kind":"no')).toEqual(emptyPersistedState())
  })

  it('parses a valid file that arrives as text', () => {
    expect(parsePersistedState(JSON.stringify(valid))).toEqual(valid)
  })
})
