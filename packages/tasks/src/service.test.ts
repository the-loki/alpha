import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { TaskService } from './service.ts'
import { TaskStore } from './store.ts'

describe('[tasks] the task service', () => {
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
      runUnattended: async () => 0,
      prompt: async () => undefined,
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
