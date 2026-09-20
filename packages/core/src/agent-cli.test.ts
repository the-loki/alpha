import { describe, expect, it } from 'vitest'
import { type AgentStatus, agentStatusKey, meetsMinimum, PI_MINIMUM_VERSION, readVersion } from './agent-cli.ts'

describe('[core] the agent Alpha runs', () => {
  it('reads the version out of what a version command printed', () => {
    expect(readVersion('0.86.0')).toBe('0.86.0')
    expect(readVersion('pi 0.86.0\n')).toBe('0.86.0')
    expect(readVersion('  v1.2.3  ')).toBe('1.2.3')
  })

  it('says nothing when the output holds no version', () => {
    expect(readVersion('')).toBeUndefined()
    expect(readVersion('command not found')).toBeUndefined()
  })

  it('compares versions by number, not by text', () => {
    expect(meetsMinimum('0.86.0', PI_MINIMUM_VERSION)).toBe(true)
    expect(meetsMinimum('0.86.1', PI_MINIMUM_VERSION)).toBe(true)
    expect(meetsMinimum('0.100.0', '0.86.0')).toBe(true)
    expect(meetsMinimum('0.85.1', PI_MINIMUM_VERSION)).toBe(false)
    expect(meetsMinimum('0.9.0', '0.86.0')).toBe(false)
  })

  it('does not claim a version it could not read', () => {
    expect(meetsMinimum(undefined, PI_MINIMUM_VERSION)).toBe(false)
    expect(meetsMinimum('nightly', PI_MINIMUM_VERSION)).toBe(false)
  })

  it('gives every state its own sentence to say', () => {
    const states: AgentStatus[] = [
      { kind: 'ready', path: '/usr/bin/pi', version: '0.86.0' },
      { kind: 'missing' },
      { kind: 'unusable', path: '/opt/pi', reason: 'it exited with code 1' },
      { kind: 'outdated', path: '/usr/bin/pi', version: '0.85.1' },
    ]

    const keys = states.map(agentStatusKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every((key) => key.startsWith('agent.'))).toBe(true)
  })
})
