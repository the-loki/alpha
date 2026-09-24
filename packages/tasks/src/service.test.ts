import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { TaskService } from './service.ts'
import { TaskStore } from './store.ts'

describe('[tasks] the task service', () => {
  it('rejects an invalid interval on create and edit without changing the saved task', () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-task-schedule-'))
    const tasks = new TaskStore(dataDirectory)
    const changed = vi.fn()
    const service = new TaskService({
      tasks,
      create: async () => 'run-1',
      rename: () => undefined,
      setLevel: () => undefined,
      runUnattended: async () => ({ refusals: 0, succeeded: true }),
      runAttended: async () => true,
      workspaceExists: () => true,
      changed,
      now: () => new Date(),
    })
    try {
      const details = { name: 'Check', prompt: 'Inspect this', workspacePath: '/tmp/work' }
      expect(() => service.save({ ...details, schedule: { kind: 'every', minutes: 0 } })).toThrow(
        'Invalid task schedule',
      )
      expect(tasks.list()).toEqual([])

      const saved = service.save({ ...details, schedule: { kind: 'every', minutes: 30 } }).tasks[0]
      expect(() => service.save({ id: saved.id, schedule: { kind: 'every', minutes: 0 } })).toThrow(
        'Invalid task schedule',
      )
      expect(tasks.find(saved.id)?.schedule).toEqual({ kind: 'every', minutes: 30 })
      expect(changed).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
    }
  })

  it('starts only one conversation for two manual requests on the same task', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-task-overlap-'))
    let finish: (succeeded: boolean) => void = () => undefined
    const gate = new Promise<boolean>((resolve) => {
      finish = resolve
    })
    const create = vi.fn(async () => 'run-1')
    const service = new TaskService({
      tasks: new TaskStore(dataDirectory),
      create,
      rename: () => undefined,
      setLevel: () => undefined,
      runUnattended: async () => ({ refusals: 0, succeeded: true }),
      runAttended: async () => gate,
      workspaceExists: () => true,
      changed: () => undefined,
      now: () => new Date(),
    })
    try {
      const saved = service.save({ name: 'Check', prompt: 'Inspect this', workspacePath: '/tmp/work' })
      const first = service.runNow(saved.tasks[0].id)
      const second = service.runNow(saved.tasks[0].id)
      finish(true)
      await Promise.all([first, second])

      expect(create).toHaveBeenCalledTimes(1)
      expect(service.snapshot().runs).toMatchObject([{ outcome: 'ok' }])
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
    }
  })

  it('records a scheduled turn as failed when it finishes unsuccessfully', async () => {
    vi.useFakeTimers()
    const at = (hour: number, minute = 0) => new Date(2026, 8, 18, hour, minute).getTime()
    vi.setSystemTime(at(8, 59))
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-task-outcome-'))
    const service = new TaskService({
      tasks: new TaskStore(dataDirectory),
      create: async () => 'run-1',
      rename: () => undefined,
      setLevel: () => undefined,
      runUnattended: async () => ({ refusals: 2, succeeded: false }),
      runAttended: async () => true,
      workspaceExists: () => true,
      changed: () => undefined,
      now: () => new Date(Date.now()),
    })
    try {
      service.save({
        name: 'Morning note',
        prompt: 'Write a note',
        workspacePath: '/tmp/alpha-workspace',
        schedule: { kind: 'daily', at: '09:00' },
      })
      service.start()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(service.snapshot().runs).toMatchObject([{ outcome: 'failed', refusals: 2 }])
    } finally {
      service.stop()
      vi.useRealTimers()
      rmSync(dataDirectory, { recursive: true, force: true })
    }
  })

  it('finishes a manual run as failed when its conversation cannot be created', async () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-task-create-'))
    const service = new TaskService({
      tasks: new TaskStore(dataDirectory),
      create: async () => {
        throw new Error('conversation unavailable')
      },
      rename: () => undefined,
      setLevel: () => undefined,
      runUnattended: async () => ({ refusals: 0, succeeded: true }),
      runAttended: async () => true,
      workspaceExists: () => true,
      changed: () => undefined,
      now: () => new Date(),
    })
    try {
      const saved = service.save({ name: 'Check', prompt: 'Inspect this', workspacePath: '/tmp/work' })
      const result = await service.runNow(saved.tasks[0].id)
      expect(result.runs).toMatchObject([{ conversationId: '', outcome: 'failed', refusals: 0 }])
      expect(result.runs[0].endedAt).toBeDefined()
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true })
    }
  })

  it('wakes for a task saved after the clock has started', async () => {
    vi.useFakeTimers()
    const at = (hour: number, minute = 0) => new Date(2026, 8, 18, hour, minute).getTime()
    vi.setSystemTime(at(8, 59))
    const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-task-clock-'))
    const create = vi.fn(async () => 'run-1')
    const service = new TaskService({
      tasks: new TaskStore(dataDirectory),
      create,
      rename: () => undefined,
      setLevel: () => undefined,
      runUnattended: async () => ({ refusals: 0, succeeded: true }),
      runAttended: async () => true,
      workspaceExists: () => true,
      changed: () => undefined,
      now: () => new Date(Date.now()),
    })

    try {
      service.start()
      await vi.advanceTimersByTimeAsync(5_000)
      service.save({
        name: 'Morning note',
        prompt: 'Write a note',
        workspacePath: '/tmp/alpha-workspace',
        schedule: { kind: 'daily', at: '09:00' },
      })
      await vi.advanceTimersByTimeAsync(55_000)
      expect(create).toHaveBeenCalledTimes(1)
    } finally {
      service.stop()
      vi.useRealTimers()
      rmSync(dataDirectory, { recursive: true, force: true })
    }
  })
})
