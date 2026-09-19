import { describe, expect, it } from 'vitest'
import { EN } from './i18n.ts'
import {
  DEFAULT_LEVEL,
  decideToolCall,
  evaluateCall,
  isPermissionLevel,
  levelDescriptionKey,
  levelKey,
  levelTone,
  PERMISSION_LEVELS,
  type PermissionLevel,
  type PermissionRule,
  ruleMatches,
} from './permission.ts'
import type { ToolRisk } from './tools.ts'

const rule = (over: Partial<PermissionRule> = {}): PermissionRule => ({
  id: 'r1',
  scope: 'workspace',
  conversationId: '',
  workspacePath: '/dev/alpha',
  toolName: 'bash',
  pattern: 'pnpm test',
  createdAt: 1,
  ...over,
})

describe('[core] the ladder', () => {
  it('is exactly the four documented levels, in order of increasing trust', () => {
    expect(PERMISSION_LEVELS).toEqual(['plan', 'ask', 'accept-edits', 'full-access'])
  })

  it('defaults a new conversation to ask', () => {
    expect(DEFAULT_LEVEL).toBe('ask')
  })
})

describe('[core] isPermissionLevel', () => {
  it('accepts every level', () => {
    for (const level of PERMISSION_LEVELS) expect(isPermissionLevel(level)).toBe(true)
  })

  it('rejects anything else arriving from a renderer or a config file', () => {
    for (const value of ['yolo', '', 'PLAN', 'accept_edits', 'full access']) {
      expect(isPermissionLevel(value)).toBe(false)
    }
  })
})

describe('[core] levelKey', () => {
  it('gives each level a word the dictionary has', () => {
    // The keys, not the words: what a level is called in a given language is the dictionary's
    // business, and this is the map from the level to the key it is read under.
    expect(PERMISSION_LEVELS.map(levelKey)).toEqual([
      'level.plan',
      'level.ask',
      'level.acceptEdits',
      'level.fullAccess',
    ])
    expect(PERMISSION_LEVELS.map((level) => EN[levelKey(level)])).toEqual([
      'Plan',
      'Ask',
      'Accept edits',
      'Full access',
    ])
  })
})

describe('[core] levelDescriptionKey', () => {
  it('gives every level something to say about itself', () => {
    for (const level of PERMISSION_LEVELS) {
      expect(EN[levelDescriptionKey(level)].length).toBeGreaterThan(10)
    }
  })
})

describe('[core] levelTone', () => {
  it('maps each level to its design token name', () => {
    expect(PERMISSION_LEVELS.map(levelTone)).toEqual(['info', 'amber', 'jade', 'warm'])
  })

  it('gives every level a distinct tone, so colour is a reliable cue', () => {
    const tones = PERMISSION_LEVELS.map(levelTone)
    expect(new Set(tones).size).toBe(PERMISSION_LEVELS.length)
  })
})

describe('[core] the decision table', () => {
  const levels: PermissionLevel[] = ['plan', 'ask', 'accept-edits', 'full-access']
  const risks: ToolRisk[] = ['read', 'write', 'execute']

  it('covers every level and every risk class', () => {
    const table = levels.map((level) => risks.map((risk) => `${level}/${risk}: ${decideToolCall(level, risk)}`))
    expect(table).toEqual([
      ['plan/read: allow', 'plan/write: block', 'plan/execute: block'],
      ['ask/read: allow', 'ask/write: ask', 'ask/execute: ask'],
      ['accept-edits/read: allow', 'accept-edits/write: allow', 'accept-edits/execute: ask'],
      ['full-access/read: allow', 'full-access/write: allow', 'full-access/execute: allow'],
    ])
  })

  it('never blocks a read, at any level', () => {
    for (const level of levels) expect(decideToolCall(level, 'read')).toBe('allow')
  })

  it('approves everything at full access', () => {
    for (const risk of risks) expect(decideToolCall('full-access', risk)).toBe('allow')
  })
})

describe('[core] deciding a call', () => {
  const base = {
    toolName: 'bash',
    args: { command: 'ls -la' },
    conversationId: 'c1',
    workspacePath: '/dev/alpha',
    rules: [] as PermissionRule[],
  }

  it('allows a read the ladder allows', () => {
    expect(evaluateCall({ ...base, level: 'ask', risk: 'read' })).toEqual({ outcome: 'allow', by: 'level' })
  })

  it('asks when the ladder asks', () => {
    expect(evaluateCall({ ...base, level: 'ask', risk: 'execute' })).toEqual({ outcome: 'ask' })
  })

  it('blocks in plan and names the level that did it', () => {
    const decision = evaluateCall({ ...base, level: 'plan', risk: 'write' })
    expect(decision.outcome).toBe('block')
    expect(decision.outcome === 'block' ? decision.reason : '').toContain('Plan')
  })

  it('lets a remembered rule stand in for the answer', () => {
    const decision = evaluateCall({
      ...base,
      level: 'ask',
      risk: 'execute',
      args: { command: 'pnpm test --watch' },
      rules: [rule()],
    })
    expect(decision).toEqual({ outcome: 'allow', by: 'rule', ruleId: 'r1' })
  })

  it('ignores a rule for another tool', () => {
    expect(evaluateCall({ ...base, level: 'ask', risk: 'execute', rules: [rule({ toolName: 'write' })] })).toEqual({
      outcome: 'ask',
    })
  })

  it('lets a rule stand in for the block in plan, because the user said so twice', () => {
    const decision = evaluateCall({
      ...base,
      level: 'plan',
      risk: 'execute',
      args: { command: 'pnpm test' },
      rules: [rule()],
    })
    expect(decision).toEqual({ outcome: 'allow', by: 'rule', ruleId: 'r1' })
  })

  it('ignores a conversation rule from another conversation', () => {
    const decision = evaluateCall({
      ...base,
      level: 'ask',
      risk: 'execute',
      args: { command: 'pnpm test' },
      rules: [rule({ scope: 'conversation', conversationId: 'other' })],
    })
    expect(decision).toEqual({ outcome: 'ask' })
  })

  it('honours a conversation rule in its own conversation', () => {
    const decision = evaluateCall({
      ...base,
      level: 'ask',
      risk: 'execute',
      args: { command: 'pnpm test' },
      rules: [rule({ scope: 'conversation', conversationId: 'c1' })],
    })
    expect(decision).toEqual({ outcome: 'allow', by: 'rule', ruleId: 'r1' })
  })
})

describe('[core] matching a rule', () => {
  it('matches the command it was created from', () => {
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm test' })).toBe(true)
  })

  it('matches a command that extends it with more arguments', () => {
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm test --run' })).toBe(true)
  })

  it('ignores how the command was spaced', () => {
    expect(ruleMatches(rule(), 'bash', { command: '  pnpm   test  ' })).toBe(true)
  })

  it('does not match a command that only starts with the same letters', () => {
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm testing-things' })).toBe(false)
  })

  it('does not match a command that continues past the prefix with a new command', () => {
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm test; rm -rf build' })).toBe(false)
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm test && curl example.com' })).toBe(false)
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm test | tee out.txt' })).toBe(false)
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm test $(whoami)' })).toBe(false)
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm test > out.txt' })).toBe(false)
    expect(ruleMatches(rule(), 'bash', { command: 'pnpm test `whoami`' })).toBe(false)
  })

  it('matches a path and the files under it, but not a sibling that shares the prefix', () => {
    const pathRule = rule({ toolName: 'write', pattern: 'src/parser' })
    expect(ruleMatches(pathRule, 'write', { path: 'src/parser' })).toBe(true)
    expect(ruleMatches(pathRule, 'write', { path: 'src/parser/index.ts' })).toBe(true)
    expect(ruleMatches(pathRule, 'write', { path: 'src/parser.ts' })).toBe(false)
    expect(ruleMatches(pathRule, 'write', { path: 'src/other/index.ts' })).toBe(false)
  })

  it('matches a path however it was written', () => {
    const pathRule = rule({ toolName: 'edit', pattern: 'src/parser/index.ts' })
    expect(ruleMatches(pathRule, 'edit', { path: './src/parser/index.ts' })).toBe(true)
    expect(ruleMatches(pathRule, 'edit', { path: 'src//parser/index.ts' })).toBe(true)
  })

  it('does not match when the arguments carry nothing to match on', () => {
    expect(ruleMatches(rule(), 'bash', {})).toBe(false)
    expect(ruleMatches(rule({ toolName: 'write', pattern: 'a.txt' }), 'write', {})).toBe(false)
  })

  it('does not let a command rule satisfy a file tool', () => {
    expect(ruleMatches(rule(), 'read', { path: 'pnpm test' })).toBe(false)
  })

  it('matches an unknown tool only on its exact arguments', () => {
    const unknown = rule({ toolName: 'mystery', pattern: '{"path":"a.txt"}' })
    expect(ruleMatches(unknown, 'mystery', { path: 'a.txt' })).toBe(true)
    expect(ruleMatches(unknown, 'mystery', { path: 'b.txt' })).toBe(false)
  })
})
