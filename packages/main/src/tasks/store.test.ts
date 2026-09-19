import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ScheduledTask, TaskRun } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { TaskStore } from './store.ts'

const task = (id: string, overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id,
  name: `Task ${id}`,
  prompt: 'look at the repository and write a short note',
  workspacePath: '/tmp/alpha-workspace',
  permissionLevel: 'ask',
  schedule: { kind: 'daily', at: '09:00' },
  enabled: true,
  createdAt: 1,
  ...overrides,
})

const freshStore = () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-tasks-'))
  return { store: new TaskStore(dataDirectory), dataDirectory }
}

describe('[tasks] where the tasks live', () => {
  it('keeps them whole, and reads them back', () => {
    const { store, dataDirectory } = freshStore()
    store.save(task('a'))
    store.save(task('b', { enabled: false }))

    const reopened = new TaskStore(dataDirectory)
    expect(reopened.list().map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(reopened.list()[1].enabled).toBe(false)
  })

  it('takes an edit in place, and forgets one that is gone', () => {
    const { store } = freshStore()
    store.save(task('a'))
    store.save(task('b'))
    store.save({ ...task('a'), name: 'Renamed', schedule: { kind: 'every', minutes: 30 } })

    expect(store.list().map((entry) => entry.name)).toEqual(['Renamed', 'Task b'])
    store.remove('a')
    expect(store.list().map((entry) => entry.id)).toEqual(['b'])
  })

  it('remembers the runs of a task, newest first and bounded', () => {
    const { store } = freshStore()
    store.save(task('a'))
    for (let index = 0; index < 25; index += 1) {
      store.record({ taskId: 'a', conversationId: `c${index}`, startedAt: index, outcome: 'ok', refusals: 0 })
    }

    const runs: TaskRun[] = store.runs('a')
    expect(runs).toHaveLength(20)
    expect(runs[0].conversationId).toBe('c24')
    expect(store.runs('b')).toEqual([])
  })

  it('keeps one row for the run that is going, and none once it has ended', () => {
    const { store } = freshStore()
    store.save(task('a'))
    store.record({ taskId: 'a', conversationId: '', startedAt: 10, outcome: 'running', refusals: 0 })
    // The conversation it turned out to be replaces the row that did not know yet.
    store.record({ taskId: 'a', conversationId: 'c1', startedAt: 10, outcome: 'running', refusals: 0 })
    expect(store.runs('a')).toHaveLength(1)

    store.record({ taskId: 'a', conversationId: 'c1', startedAt: 10, outcome: 'ok', refusals: 2, endedAt: 20 })
    expect(store.runs('a')).toHaveLength(1)
    expect(store.runs('a')[0]).toMatchObject({ outcome: 'ok', refusals: 2, endedAt: 20 })
  })

  it('treats a file it cannot read as no tasks at all, rather than as a crash', () => {
    const { store, dataDirectory } = freshStore()
    store.save(task('a'))
    const broken = new TaskStore(dataDirectory)
    broken.remove('a')
    expect(new TaskStore(dataDirectory).list()).toEqual([])
  })
})
