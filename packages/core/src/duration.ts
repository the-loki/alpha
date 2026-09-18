/**
 * How long something took, in the two units a transcript ever needs. Two components were each
 * doing this arithmetic; the ledger and the thinking block should read the same way.
 */
export function formatDuration(startedAt: number | undefined, endedAt: number | undefined): string {
  if (startedAt === undefined || endedAt === undefined) return ''
  const seconds = Math.max(0, (endedAt - startedAt) / 1000)
  return seconds < 1 ? `${Math.round(seconds * 1000)}ms` : `${seconds.toFixed(1)}s`
}
