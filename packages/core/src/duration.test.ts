import { describe, expect, it } from 'vitest'
import { formatAge, formatDuration } from './duration.ts'

describe('[core] how long something took', () => {
  it('counts in milliseconds below a second, and seconds above it', () => {
    expect(formatDuration(1000, 1250)).toBe('250ms')
    expect(formatDuration(1000, 3400)).toBe('2.4s')
  })

  it('has nothing to say when either end is missing', () => {
    expect(formatDuration(undefined, 2000)).toBe('')
    expect(formatDuration(1000, undefined)).toBe('')
  })
})

describe('[core] how long ago something was', () => {
  const now = 1_700_000_000_000

  it('reads as just now until a minute has passed', () => {
    expect(formatAge(now, now)).toBe('just now')
    expect(formatAge(now - 44_000, now)).toBe('just now')
  })

  it('counts minutes, then hours, then days', () => {
    expect(formatAge(now - 5 * 60_000, now)).toBe('5m ago')
    expect(formatAge(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(formatAge(now - 2 * 86_400_000, now)).toBe('2d ago')
  })

  it('never counts backwards, whatever the clock says', () => {
    // A file touched by a clock that is ahead of ours is "just now", not "-3m ago".
    expect(formatAge(now + 60_000, now)).toBe('just now')
  })
})
