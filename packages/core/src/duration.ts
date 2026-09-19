/**
 * How long something took, in the two units a transcript ever needs. Two components were each
 * doing this arithmetic; the ledger and the thinking block should read the same way.
 */

import type { Absent } from './absence.ts'

export function formatDuration(startedAt: Absent<number>, endedAt: Absent<number>): string {
  if (startedAt === undefined || endedAt === undefined) return ''
  const seconds = Math.max(0, (endedAt - startedAt) / 1000)
  return seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${seconds.toFixed(1)}s`
}
