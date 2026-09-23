// The daylight-saving rules, in a zone that has them: this file pins Europe/Berlin so the two
// cases ADR-0013 names can actually be exercised. The machine's own zone decides nothing here.
process.env.TZ = 'Europe/Berlin'

import { describe, expect, it } from 'vitest'
import { nextRunAt, runDue } from './schedule.ts'

const local = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(year, month - 1, day, hour, minute)

describe('[domain] a daily schedule across the clock changes', () => {
  it('runs at the first minute that exists when the clock springs past its time', () => {
    // 02:30 does not happen on 29 March 2026 in Berlin: the clock goes 01:59 to 03:00.
    const schedule = { kind: 'daily', at: '02:30' } as const
    const due = nextRunAt(schedule, local(2026, 3, 29, 1), undefined)

    expect(new Date(due).getHours()).toBe(3)
    expect(new Date(due).getMinutes()).toBe(30)
    expect(due).toBe(local(2026, 3, 29, 3, 30).getTime())
  })

  it('runs once, not twice, when the clock falls back over its time', () => {
    // 02:30 happens twice on 25 October 2026. The first one is the run; the second is not.
    const schedule = { kind: 'daily', at: '02:30' } as const
    const first = local(2026, 10, 25, 2, 30)
    expect(nextRunAt(schedule, first, first.getTime())).toBe(local(2026, 10, 26, 2, 30).getTime())
  })

  it('is due at the morning it names, having been closed overnight', () => {
    const schedule = { kind: 'daily', at: '09:00' } as const
    const yesterday = local(2026, 3, 28, 9).getTime()
    expect(runDue(schedule, local(2026, 3, 1, 0), local(2026, 3, 29, 10), yesterday)).toBe(
      local(2026, 3, 29, 10).getTime(),
    )
  })
})
