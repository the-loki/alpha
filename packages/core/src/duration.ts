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
