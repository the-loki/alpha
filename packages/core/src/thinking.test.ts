import { describe, expect, it } from 'vitest'
import { EN } from './i18n.ts'
import { DEFAULT_THINKING_LEVEL, isThinkingLevel, THINKING_LEVELS, thinkingKey } from './thinking.ts'

describe('[core] the thinking ladder', () => {
  it('runs from off to max, cheapest first', () => {
    expect(THINKING_LEVELS).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  })

  it('starts a conversation in the middle', () => {
    expect(DEFAULT_THINKING_LEVEL).toBe('medium')
  })

  it('labels every level', () => {
    for (const level of THINKING_LEVELS) expect(EN[thinkingKey(level)]).not.toBe('')
  })

  it('rejects anything a renderer or config file might send', () => {
    expect(isThinkingLevel('enormous')).toBe(false)
    expect(isThinkingLevel(3)).toBe(false)
    expect(THINKING_LEVELS.every((level) => isThinkingLevel(level))).toBe(true)
  })
})
