import { describe, expect, it } from 'vitest'
import { DEFAULT_LEVEL, isPermissionLevel, levelLabel, levelTone, PERMISSION_LEVELS } from './permission.ts'

describe('the ladder', () => {
  it('is exactly the four documented levels, in order of increasing trust', () => {
    expect(PERMISSION_LEVELS).toEqual(['plan', 'ask', 'accept-edits', 'full-access'])
  })

  it('defaults a new conversation to ask', () => {
    expect(DEFAULT_LEVEL).toBe('ask')
  })
})

describe('isPermissionLevel', () => {
  it('accepts every level', () => {
    for (const level of PERMISSION_LEVELS) expect(isPermissionLevel(level)).toBe(true)
  })

  it('rejects anything else arriving from a renderer or a config file', () => {
    for (const value of ['yolo', '', 'PLAN', 'accept_edits', 'full access']) {
      expect(isPermissionLevel(value)).toBe(false)
    }
  })
})

describe('levelLabel', () => {
  it('gives each level the words the UI shows', () => {
    expect(PERMISSION_LEVELS.map(levelLabel)).toEqual(['Plan', 'Ask', 'Accept edits', 'Full access'])
  })
})

describe('levelTone', () => {
  it('maps each level to its design token name', () => {
    expect(PERMISSION_LEVELS.map(levelTone)).toEqual(['info', 'amber', 'jade', 'ember'])
  })

  it('gives every level a distinct tone, so colour is a reliable cue', () => {
    const tones = PERMISSION_LEVELS.map(levelTone)
    expect(new Set(tones).size).toBe(PERMISSION_LEVELS.length)
  })
})
