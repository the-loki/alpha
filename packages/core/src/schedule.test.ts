import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCHEDULE,
  isSchedule,
  isValidSchedule,
  MINIMUM_INTERVAL_MINUTES,
  nextRunAt,
  parseDailyTime,
  runDue,
  scheduleKey,
} from './schedule.ts'

/** Local wall-clock, which is what a schedule is written in. */
const at = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(year, month - 1, day, hour, minute)

describe('[core] a schedule says when a task runs', () => {
  it('runs an interval one interval after the last run, and after it was made the first time', () => {
    const schedule = { kind: 'every', minutes: 30 } as const
    const made = at(2026, 9, 18, 9)
    expect(nextRunAt(schedule, made, undefined)).toBe(made.getTime() + 30 * 60_000)

    const ran = at(2026, 9, 18, 9, 30)
    expect(nextRunAt(schedule, made, ran.getTime())).toBe(ran.getTime() + 30 * 60_000)
  })

  it('runs a daily task at its own minute today if that is still ahead, else tomorrow', () => {
    const schedule = { kind: 'daily', at: '09:00' } as const
    expect(nextRunAt(schedule, at(2026, 9, 18, 7), undefined)).toBe(at(2026, 9, 18, 9).getTime())
    expect(nextRunAt(schedule, at(2026, 9, 18, 11), undefined)).toBe(at(2026, 9, 19, 9).getTime())
  })

  it('moves a daily task to the next day once it has run, even at the same minute', () => {
    const schedule = { kind: 'daily', at: '09:00' } as const
    expect(nextRunAt(schedule, at(2026, 9, 18, 9), at(2026, 9, 18, 9).getTime())).toBe(at(2026, 9, 19, 9).getTime())
  })

  it('says a task is due once its moment has passed, and not before it', () => {
    const schedule = { kind: 'every', minutes: 60 } as const
    const made = at(2026, 9, 18, 9)
    expect(runDue(schedule, made, at(2026, 9, 18, 9, 59))).toBeUndefined()
    expect(runDue(schedule, made, at(2026, 9, 18, 10))).toBe(at(2026, 9, 18, 10).getTime())
  })

  it('catches a missed run up once, however long the workbench was closed', () => {
    const schedule = { kind: 'every', minutes: 30 } as const
    const made = at(2026, 9, 18, 9)
    // Eight hours of missed half-hours are one run, not sixteen.
    const late = at(2026, 9, 18, 17)
    expect(runDue(schedule, made, late)).toBe(late.getTime())
    // And once it has run, the interval counts from then rather than from the missed one.
    expect(runDue(schedule, made, late, late.getTime())).toBeUndefined()
    expect(runDue(schedule, made, at(2026, 9, 18, 17, 30), late.getTime())).toBe(at(2026, 9, 18, 17, 30).getTime())
  })

  it('holds a daily time to the minute it names', () => {
    expect(parseDailyTime('09:05')).toEqual({ hour: 9, minute: 5 })
    expect(parseDailyTime('9:05')).toBeUndefined()
    expect(parseDailyTime('24:00')).toBeUndefined()
    expect(parseDailyTime('09:60')).toBeUndefined()
    expect(parseDailyTime('nine')).toBeUndefined()
  })

  it('refuses a schedule that would be a loop rather than a schedule', () => {
    expect(isValidSchedule({ kind: 'every', minutes: MINIMUM_INTERVAL_MINUTES })).toBe(true)
    expect(isValidSchedule({ kind: 'every', minutes: MINIMUM_INTERVAL_MINUTES - 1 })).toBe(false)
    expect(isValidSchedule({ kind: 'every', minutes: 0 })).toBe(false)
    expect(isValidSchedule({ kind: 'daily', at: '09:00' })).toBe(true)
    expect(isValidSchedule({ kind: 'daily', at: '9:00' })).toBe(false)
    expect(isValidSchedule({ kind: 'hourly' })).toBe(false)
    expect(isValidSchedule(undefined)).toBe(false)

    expect(isSchedule({ kind: 'daily', at: '09:00' })).toBe(true)
    expect(isSchedule({ kind: 'every', minutes: 8.5 })).toBe(false)
  })

  it('describes itself in one line the window can print', () => {
    expect(scheduleKey({ kind: 'every', minutes: 30 })).toBe('every30')
    expect(scheduleKey({ kind: 'daily', at: '09:00' })).toBe('daily09:00')
    expect(DEFAULT_SCHEDULE).toEqual({ kind: 'daily', at: '09:00' })
  })
})
