import { describe, expect, it } from 'vitest'
import { addUsage, EMPTY_USAGE, formatCost, formatTokens, hasCost, type UsageTotals } from './usage.ts'

const usage = (over: Partial<UsageTotals> = {}): UsageTotals => ({
  input: 1200,
  output: 340,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 1540,
  cost: 0,
  ...over,
})

describe('[core] addUsage', () => {
  it('adds every field, including the cost', () => {
    const sum = addUsage(usage(), usage({ input: 800, output: 60, totalTokens: 860, cost: 0.02 }))
    expect(sum).toEqual({
      input: 2000,
      output: 400,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2400,
      cost: 0.02,
    })
  })

  it('starts from zero', () => {
    expect(addUsage(EMPTY_USAGE, usage({ cost: 0.5 }))).toEqual(usage({ cost: 0.5 }))
  })

  it('is what makes the session total the sum of its turns', () => {
    const turns = [usage({ totalTokens: 100 }), usage({ totalTokens: 250 }), usage({ totalTokens: 7 })]
    expect(turns.reduce(addUsage, EMPTY_USAGE).totalTokens).toBe(357)
  })
})

describe('[core] hasCost', () => {
  it('is true only when the model reported a cost', () => {
    expect(hasCost(usage())).toBe(false)
    expect(hasCost(usage({ cost: 0.0001 }))).toBe(true)
  })
})

describe('[core] formatTokens', () => {
  it('shows small counts as they are', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(940)).toBe('940')
  })

  it('shortens thousands and millions, which is all a header needs', () => {
    expect(formatTokens(1540)).toBe('1.5k')
    expect(formatTokens(12000)).toBe('12k')
    expect(formatTokens(1_240_000)).toBe('1.2M')
  })
})

describe('[core] formatCost', () => {
  it('keeps four decimals, because a turn often costs less than a cent', () => {
    expect(formatCost(0.0042)).toBe('$0.0042')
    expect(formatCost(1.5)).toBe('$1.5000')
  })

  it('shows nothing when there is no cost to show', () => {
    expect(formatCost(0)).toBe('')
  })
})
