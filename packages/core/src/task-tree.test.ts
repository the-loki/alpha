import { describe, expect, it } from 'vitest'
import type { ConversationSummary } from './runtime-events.ts'
import type { ScheduledTask, TaskRun } from './task.ts'
import { folderTasks, lastRunOf, newTaskRun, withoutRuns } from './task-tree.ts'

const conversation = (id: string, updatedAt: number, archivedAt?: number): ConversationSummary => ({
  id,
  workspacePath: '/dev/alpha',
  title: 'Nightly check',
  createdAt: updatedAt - 10,
  updatedAt,
  status: 'idle',
  permissionLevel: 'ask',
  model: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
  thinkingLevel: 'medium',
  sessionId: '',
  ...(archivedAt === undefined ? {} : { archivedAt }),
})

const task = (id: string, overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id,
  name: `Task ${id}`,
  prompt: 'look around',
  workspacePath: '/dev/alpha',
  permissionLevel: 'ask',
  schedule: { kind: 'daily', at: '09:00' },
  enabled: true,
  createdAt: 1,
  ...overrides,
})

const run = (taskId: string, conversationId: string, startedAt: number, overrides: Partial<TaskRun> = {}): TaskRun => ({
  taskId,
  conversationId,
  startedAt,
  outcome: 'ok',
  refusals: 0,
  ...overrides,
})

describe('[core] a folder and the tasks in it', () => {
  it('holds only the tasks that run in this folder, in the order they were made', () => {
    const tasks = [task('a'), task('b', { workspacePath: '/dev/beta' }), task('c')]
    const nodes = folderTasks(tasks, [], [], '/dev/alpha')
    expect(nodes.map((node) => node.task.id)).toEqual(['a', 'c'])
  })

  it('answers with the conversations its runs made, newest first', () => {
    const nodes = folderTasks(
      [task('a')],
      [run('a', 'c1', 10), run('a', 'c2', 30)],
      [conversation('c1', 10), conversation('c2', 30)],
      '/dev/alpha',
    )
    expect(nodes[0].runs.map((entry) => entry.id)).toEqual(['c2', 'c1'])
  })

  it('leaves out a run whose conversation is gone, rather than a hole in the list', () => {
    const nodes = folderTasks(
      [task('a')],
      [run('a', 'c1', 10), run('a', 'deleted', 20)],
      [conversation('c1', 10)],
      '/dev/alpha',
    )
    expect(nodes[0].runs.map((entry) => entry.id)).toEqual(['c1'])
  })

  it('keeps an archived run out of the tree, because the archived section holds it', () => {
    const nodes = folderTasks([task('a')], [run('a', 'c1', 10)], [conversation('c1', 10, 99)], '/dev/alpha')
    expect(nodes[0].runs).toEqual([])
  })

  it('says how the last run went, which is what a folded task shows', () => {
    const newest = run('a', 'c2', 30, { outcome: 'failed' })
    const nodes = folderTasks(
      [task('a')],
      [run('a', 'c1', 10), newest],
      [conversation('c1', 10), conversation('c2', 30)],
      '/dev/alpha',
    )
    expect(nodes[0].lastRun).toEqual(newest)
    expect(lastRunOf([run('a', 'c1', 10), newest])).toEqual(newest)
    expect(lastRunOf([])).toBeUndefined()
  })

  it('names the two things a folded task says: how many were refused, and how it ended', () => {
    expect(newTaskRun(run('a', 'c1', 10, { refusals: 3 }))).toEqual({ key: 'tasks.runRefusals', count: 3 })
    expect(newTaskRun(run('a', 'c1', 10, { outcome: 'failed' }))).toEqual({ key: 'tasks.runFailed' })
    expect(newTaskRun(run('a', 'c1', 10, { outcome: 'skipped' }))).toEqual({ key: 'tasks.runSkipped' })
    expect(newTaskRun(run('a', 'c1', 10, { outcome: 'running' }))).toEqual({ key: 'tasks.runRunning' })
    expect(newTaskRun(run('a', 'c1', 10))).toEqual({ key: 'tasks.runOk' })
    expect(newTaskRun(undefined)).toBeUndefined()
  })

  it('answers with a task whose runs span two folders from the one it runs in', () => {
    const nodes = folderTasks([task('a')], [run('a', 'c1', 10)], [conversation('c1', 10)], '/dev/beta')
    expect(nodes).toEqual([])
  })

  it('leaves the runs to their task, so the folder is what was asked by hand', () => {
    const kept = withoutRuns([conversation('c1', 10), conversation('c2', 20)], [run('a', 'c2', 20)])
    expect(kept.map((entry) => entry.id)).toEqual(['c1'])
  })

  it('keeps the runs of one task out of another', () => {
    const nodes = folderTasks(
      [task('a'), task('b')],
      [run('a', 'c1', 10), run('b', 'c2', 20)],
      [conversation('c1', 10), conversation('c2', 20)],
      '/dev/alpha',
    )
    expect(nodes[0].runs.map((entry) => entry.id)).toEqual(['c1'])
    expect(nodes[1].runs.map((entry) => entry.id)).toEqual(['c2'])
  })
})
