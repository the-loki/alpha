/**
 * When a task runs: the arithmetic, and nothing else. Two kinds of schedule and no cron — an
 * interval and a daily time cover what a personal workbench asks for, and a third kind can be
 * added when someone wants it (ADR-0013). Time is local wall-clock, and daylight saving is not a
 * special case: a time that does not exist on that day is answered by the first minute that does,
 * and a time that happens twice still runs once, because the rule is "later than the last run".
 */

import type { Undef } from './maybe.ts'

export interface EverySchedule {
  kind: 'every'
  minutes: number
}

export interface DailySchedule {
  /** Local wall-clock, `HH:MM`. */
  kind: 'daily'
  at: string
}

export type TaskSchedule = EverySchedule | DailySchedule

/** Below this, a task is not a schedule but a loop, and every run costs a model call. */
export const MINIMUM_INTERVAL_MINUTES = 5

export const DEFAULT_SCHEDULE: TaskSchedule = { kind: 'daily', at: '09:00' }

const DAILY = /^(\d{2}):(\d{2})$/

export function parseDailyTime(value: string): Undef<{ hour: number; minute: number }> {
  const matched = DAILY.exec(value)
  if (matched === null) return undefined
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) return undefined
  return { hour, minute }
}

export function isSchedule(value: unknown): value is TaskSchedule {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { kind?: unknown; minutes?: unknown; at?: unknown }
  if (candidate.kind === 'every') {
    return typeof candidate.minutes === 'number' && Number.isInteger(candidate.minutes)
  }
  if (candidate.kind === 'daily') {
    return typeof candidate.at === 'string' && parseDailyTime(candidate.at) !== undefined
  }
  return false
}

export function isValidSchedule(value: unknown): value is TaskSchedule {
  if (!isSchedule(value)) return false
  if (value.kind === 'every') return value.minutes >= MINIMUM_INTERVAL_MINUTES
  return true
}

/** One line that names the schedule, for a key the window turns into words. */
export function scheduleKey(schedule: TaskSchedule): string {
  return schedule.kind === 'daily' ? `daily${schedule.at}` : `every${schedule.minutes}`
}

/**
 * The next moment this schedule wants, strictly after `lastRunAt` (or after `from`, which is the
 * task being made). A daily task's answer is always later than the last run rather than the same
 * minute again, which is what keeps a repeated hour from running twice.
 */
export function nextRunAt(schedule: TaskSchedule, from: Date, lastRunAt: Undef<number>): number {
  const after = new Date(lastRunAt === undefined ? from.getTime() : Math.max(lastRunAt, from.getTime()))
  if (schedule.kind === 'every') return after.getTime() + schedule.minutes * 60_000

  const time = parseDailyTime(schedule.at) ?? { hour: 9, minute: 0 }
  // The local constructor answers a time that does not exist with the first minute that does, so
  // the hour a clock skips over is not a case the rest of this has to know about.
  const today = new Date(after.getFullYear(), after.getMonth(), after.getDate(), time.hour, time.minute)
  if (today.getTime() > after.getTime()) return today.getTime()
  return new Date(after.getFullYear(), after.getMonth(), after.getDate() + 1, time.hour, time.minute).getTime()
}

/**
 * The moment a task is owed, if it is owed one: a run whose time passed while the workbench was
 * closed is caught up here — once, at the moment it is asked, however many occurrences were
 * missed. That is the whole of the catch-up rule (ADR-0013).
 */
export function runDue(schedule: TaskSchedule, from: Date, now: Date, lastRunAt?: Undef<number>): Undef<number> {
  const due = nextRunAt(schedule, from, lastRunAt)
  return due <= now.getTime() ? now.getTime() : undefined
}
