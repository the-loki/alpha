import type { ScheduledTask, TaskRun } from '@alpha/domain'
import { describe, expect, it, vi } from 'vitest'
import { Scheduler, type SchedulerPorts } from './scheduler.ts'
import type { TaskStore } from './store.ts'

const task = (id: string, overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id,
  name: `Task ${id}`,
  prompt: 'write a short note about the repository',
  workspacePath: '/tmp/alpha-workspace',
  permissionLevel: 'ask',
  schedule: { kind: 'every', minutes: 30 },
  enabled: true,
  createdAt: 1000,
  ...overrides,
})

/** A store with no file behind it: the scheduler's own behaviour is what is under test here. */
const fakeStore = (tasks: ScheduledTask[]) =>
  ({
    list: () => tasks.map((entry) => ({ ...entry })),
    find: (id: string) => tasks.find((entry) => entry.id === id),
    markRan: (id: string, at: number) => {
      const found = tasks.find((entry) => entry.id === id)
      if (found !== undefined) found.lastRunAt = at
    },
    save: (entry: ScheduledTask) => {
      const index = tasks.findIndex((candidate) => candidate.id === entry.id)
      if (index >= 0) tasks[index] = entry
      else tasks.push(entry)
      return entry
    },
  }) as unknown as TaskStore

const harness = (tasks: ScheduledTask[], run: SchedulerPorts['run'], nowMs: number) => {
  const store = fakeStore(tasks)
  const runs: TaskRun[] = []
  const ports: SchedulerPorts = {
    tasks: store,
    workspaceExists: () => true,
    run,
    runs: (run) => runs.push(run),
    changed: () => undefined,
    now: () => new Date(nowMs),
    ...{},
  }
  return { scheduler: new Scheduler(ports), runs, store }
}

describe('[tasks] the clock', () => {
  it('runs a task when its moment has come, and remembers when it started', async () => {
    const tasks = [task('a', { createdAt: 0, schedule: { kind: 'every', minutes: 30 } })]
    const run = vi.fn(async () => ({ conversationId: 'c1', refusals: 0, outcome: 'ok' as const }))
    const { scheduler } = harness(tasks, run, 31 * 60_000)

    await scheduler.tick()

    expect(run).toHaveBeenCalledTimes(1)
    expect(tasks[0].lastRunAt).toBe(31 * 60_000)
  })

  it('leaves a task alone until its moment, and leaves a task that is off alone entirely', async () => {
    const tasks = [task('a', { createdAt: 0 }), task('b', { createdAt: 0, enabled: false })]
    const run = vi.fn(async () => ({ conversationId: 'c', refusals: 0, outcome: 'ok' as const }))
    const { scheduler } = harness(tasks, run, 60_000)

    await scheduler.tick()
    expect(run).not.toHaveBeenCalled()
  })

  it('runs one task at a time, and comes back for the others', async () => {
    const tasks = [task('a', { createdAt: 0 }), task('b', { createdAt: 0 })]
    let live = 0
    let most = 0
    const order: string[] = []
    const run = async (candidate: ScheduledTask, started: (conversationId: string) => void) => {
      live += 1
      most = Math.max(most, live)
      order.push(candidate.id)
      started(`c-${candidate.id}`)
      await new Promise((resolve) => setTimeout(resolve, 5))
      live -= 1
      tasks.find((entry) => entry.id === candidate.id)!.lastRunAt = 60 * 60_000
      return { conversationId: `c-${candidate.id}`, refusals: 0, outcome: 'ok' as const }
    }
    const { scheduler } = harness(tasks, run, 60 * 60_000)

    await scheduler.tick()
    await scheduler.tick()

    expect(most).toBe(1)
    expect(order).toEqual(['a', 'b'])
  })

  it('skips a task whose folder is gone, and says why rather than failing', async () => {
    const tasks = [task('a', { createdAt: 0 })]
    const run = vi.fn()
    const store = fakeStore(tasks)
    const runs: unknown[] = []
    const scheduler = new Scheduler({
      tasks: store,
      workspaceExists: () => false,
      run,
      runs: (run) => runs.push(run),
      changed: () => undefined,
      now: () => new Date(60 * 60_000),
    })

    await scheduler.tick()

    expect(run).not.toHaveBeenCalled()
    expect(runs[0]).toMatchObject({ taskId: 'a', outcome: 'skipped', note: 'missingFolder' })
  })

  it('records how a run ended, and how many steps nobody was there to approve', async () => {
    const tasks = [task('a', { createdAt: 0 })]
    const finish = vi.fn()
    const run = async () => ({ conversationId: 'c9', refusals: 3, outcome: 'ok' as const })
    const scheduler = new Scheduler({
      tasks: fakeStore(tasks),
      workspaceExists: () => true,
      run,
      runs: (run) => finish({ ...run, endedAt: 0 }),
      changed: () => undefined,
      now: () => new Date(60 * 60_000),
    })

    await scheduler.tick()

    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'c9', refusals: 3, outcome: 'ok', catchUp: true }),
    )
  })

  it('marks a run that stood in for a missed one, and not one that was on time', async () => {
    const late = [task('a', { createdAt: 0, schedule: { kind: 'daily', at: '09:00' } })]
    const onTimeTasks = [task('b', { createdAt: 0, schedule: { kind: 'every', minutes: 30 } })]
    const seen: boolean[] = []
    const ports = (tasks: ScheduledTask[], nowMs: number): SchedulerPorts => ({
      tasks: fakeStore(tasks),
      workspaceExists: () => true,
      run: async (candidate) => ({ conversationId: `c-${candidate.id}`, refusals: 0, outcome: 'ok' as const }),
      // Two rows per run — it starts, then it ends — and the ending is the one that says how it went.
      runs: (run) => {
        if (run.outcome !== 'running') seen.push(run.catchUp === true)
      },
      changed: () => undefined,
      now: () => new Date(nowMs),
    })

    // A daily task three days after it was made is catching up; an interval one a minute late is not
    // (its interval has simply not come round again).
    await new Scheduler(ports(late, new Date(2026, 8, 21, 10).getTime())).tick()
    await new Scheduler(ports(onTimeTasks, 31 * 60_000)).tick()

    expect(seen).toEqual([true, false])
  })
})

describe('[tasks] the timer', () => {
  it('starts no further task after the clock is stopped during a run', async () => {
    const tasks = [task('a', { createdAt: 0 }), task('b', { createdAt: 0 })]
    let finish: (() => void) | undefined
    const run = vi.fn(async (candidate: ScheduledTask) => {
      if (candidate.id === 'a')
        await new Promise<void>((resolve) => {
          finish = resolve
        })
      return { conversationId: `c-${candidate.id}`, refusals: 0, outcome: 'ok' as const }
    })
    const { scheduler } = harness(tasks, run, 60 * 60_000)

    scheduler.start()
    const pass = scheduler.tick()
    expect(run).toHaveBeenCalledTimes(1)
    scheduler.stop()
    finish?.()
    await pass

    expect(run).toHaveBeenCalledTimes(1)
  })

  it('wakes for a daily task later today', async () => {
    vi.useFakeTimers()
    const at = (hour: number, minute = 0) => new Date(2026, 8, 18, hour, minute).getTime()
    vi.setSystemTime(at(8, 59))
    try {
      const tasks = [task('a', { createdAt: at(8), schedule: { kind: 'daily', at: '09:00' } })]
      const run = vi.fn(async () => ({ conversationId: 'c', refusals: 0, outcome: 'ok' as const }))
      const scheduler = new Scheduler({
        tasks: fakeStore(tasks),
        workspaceExists: () => true,
        run,
        runs: () => undefined,
        changed: () => undefined,
        now: () => new Date(Date.now()),
      })

      scheduler.start()
      await vi.advanceTimersToNextTimerAsync()
      expect(run).not.toHaveBeenCalled()
      await vi.advanceTimersToNextTimerAsync()
      expect(Date.now()).toBe(at(9))
      expect(run).toHaveBeenCalledTimes(1)
      scheduler.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sleeps until a daily task due tomorrow', async () => {
    vi.useFakeTimers()
    const today = (hour: number, minute = 0) => new Date(2026, 8, 18, hour, minute).getTime()
    const tomorrowAtNine = new Date(2026, 8, 19, 9).getTime()
    vi.setSystemTime(today(9, 1))
    try {
      const tasks = [
        task('a', {
          createdAt: today(8),
          lastRunAt: today(9),
          schedule: { kind: 'daily', at: '09:00' },
        }),
      ]
      const run = vi.fn(async () => ({ conversationId: 'c', refusals: 0, outcome: 'ok' as const }))
      const scheduler = new Scheduler({
        tasks: fakeStore(tasks),
        workspaceExists: () => true,
        run,
        runs: () => undefined,
        changed: () => undefined,
        now: () => new Date(Date.now()),
      })

      scheduler.start()
      await vi.advanceTimersToNextTimerAsync()
      await vi.advanceTimersToNextTimerAsync()
      expect(Date.now()).toBe(tomorrowAtNine)
      expect(run).toHaveBeenCalledTimes(1)
      scheduler.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('arms itself for the next moment, and stopping clears it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    try {
      const tasks = [task('a', { createdAt: 0, schedule: { kind: 'every', minutes: 30 } })]
      const run = vi.fn(async () => ({ conversationId: 'c', refusals: 0, outcome: 'ok' as const }))
      // The clock the scheduler reads is the one the fake timers move.
      const scheduler = new Scheduler({
        tasks: fakeStore(tasks),
        workspaceExists: () => true,
        run,
        runs: () => undefined,
        changed: () => undefined,
        now: () => new Date(Date.now()),
      })

      scheduler.start()
      // Nothing at once: the first check waits for the moment, and a catch-up waits a beat so the
      // window is up before a run starts behind it.
      expect(run).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(30 * 60_000)
      expect(run).toHaveBeenCalledTimes(1)

      scheduler.stop()
      await vi.advanceTimersByTimeAsync(60 * 60_000)
      expect(run).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
