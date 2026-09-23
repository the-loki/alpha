/**
 * How long something took, in the two units a transcript ever needs. Two components were each
 * doing this arithmetic; the ledger and the thinking block should read the same way.
 */

import type { Undef } from './maybe.ts'

export function formatDuration(startedAt: Undef<number>, endedAt: Undef<number>): string {
  if (startedAt === undefined || endedAt === undefined) return ''
  const seconds = Math.max(0, (endedAt - startedAt) / 1000)
  return seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${seconds.toFixed(1)}s`
}

/**
 * How long ago something happened, in the one unit a header needs. It is the age of a
 * conversation, so it reads as "just now" until a minute has passed and never as a date: the
 * workbench is about what you were doing, not a log.
 */
export function formatAge(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/**
 * How long until something happens, which is the same arithmetic read forwards. A moment that has
 * arrived or passed is "now" rather than a negative age: a task that is due is due.
 */
export function formatUntil(at: number, now: number): string {
  const seconds = Math.round((at - now) / 1000)
  if (seconds < 45) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}
