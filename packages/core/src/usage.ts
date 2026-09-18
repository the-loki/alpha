/**
 * What a conversation has spent. The numbers come from the provider's own accounting: the runtime
 * reports them as they arrive, the transcript adds them up per turn, and the header shows the sum.
 * Cost is only shown when the model's own cost data is non-zero — a made-up figure is worse than
 * no figure.
 */

export interface UsageTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  /** In the provider's currency unit, which for every provider we speak to is US dollars. */
  cost: number
}

export const EMPTY_USAGE: UsageTotals = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: 0,
}

export function addUsage(left: UsageTotals, right: UsageTotals): UsageTotals {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
    totalTokens: left.totalTokens + right.totalTokens,
    cost: left.cost + right.cost,
  }
}

export function hasCost(usage: UsageTotals): boolean {
  return usage.cost > 0
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) {
    const thousands = tokens / 1000
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`
  }
  return String(tokens)
}

/** Four decimals: a turn routinely costs less than a cent, and rounding it to $0.00 says nothing. */
export function formatCost(cost: number): string {
  return cost > 0 ? `$${cost.toFixed(4)}` : ''
}
