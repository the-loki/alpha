/**
 * The tasks, in one file beside the conversation index, written whole — the same shape as every
 * other small store in the workbench. A file that cannot be read is treated as no tasks rather
 * than as a crash: the alternative is a window that will not open because of a stray comma.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emptyTaskFile,
  isSchedule,
  isValidSchedule,
  RUNS_KEPT,
  type ScheduledTask,
  type TaskFile,
  type TaskRun,
  type Undef,
} from '@alpha/domain'

export class TaskStore {
  private readonly path: string
  private file: TaskFile

  public constructor(dataDirectory: string) {
    this.path = join(dataDirectory, 'tasks.json')
    this.file = this.read()
    if (this.file.runs.some((run) => run.outcome === 'running')) {
      const endedAt = Date.now()
      this.file = {
        ...this.file,
        runs: this.file.runs.map((run) =>
          run.outcome === 'running' ? { ...run, outcome: 'failed', endedAt: Math.max(endedAt, run.startedAt) } : run,
        ),
      }
      this.flush()
    }
  }

  public list(): ScheduledTask[] {
    return this.file.tasks.map((task) => ({ ...task }))
  }

  public find(id: string): Undef<ScheduledTask> {
    const task = this.file.tasks.find((entry) => entry.id === id)
    return task === undefined ? undefined : { ...task }
  }

  /**
   * One road for a new task and an edit of one: the id is what tells them apart. An edit keeps the
   * place the task already had, so the list does not reshuffle because someone changed a time.
   */
  public save(task: ScheduledTask): ScheduledTask {
    const known = this.file.tasks.some((entry) => entry.id === task.id)
    const tasks = known
      ? this.file.tasks.map((entry) => (entry.id === task.id ? task : entry))
      : [...this.file.tasks, task]
    this.file = { ...this.file, tasks }
    this.flush()
    return { ...task }
  }

  public remove(id: string): void {
    this.file = {
      ...this.file,
      tasks: this.file.tasks.filter((entry) => entry.id !== id),
      runs: this.file.runs.filter((run) => run.taskId !== id),
    }
    this.flush()
  }

  /** When a task last ran, which is what its next run is measured from. */
  public markRan(id: string, at: number): void {
    const task = this.find(id)
    if (task !== undefined) this.save({ ...task, lastRunAt: at })
  }

  public runs(taskId: string): TaskRun[] {
    return this.file.runs.filter((run) => run.taskId === taskId).map((run) => ({ ...run }))
  }

  /**
   * Adds a run row, keeping each task's newest: the conversations are the long history. Updates
   * replace only their own running row, so a skipped occurrence can sit beside a live run. The
   * active row takes one of the history slots even when later occurrences have been skipped.
   */
  public record(run: TaskRun): void {
    const kept = this.file.runs.filter(
      (existing) =>
        existing.taskId !== run.taskId ||
        existing.outcome !== 'running' ||
        run.outcome === 'skipped' ||
        existing.startedAt !== run.startedAt,
    )
    const hasRunning =
      run.outcome === 'running' ||
      kept.some((existing) => existing.taskId === run.taskId && existing.outcome === 'running')
    let own = 0
    const runs = [run, ...kept]
      .sort((left, right) => right.startedAt - left.startedAt)
      .filter(
        (entry) =>
          entry.taskId !== run.taskId || entry.outcome === 'running' || ++own <= RUNS_KEPT - (hasRunning ? 1 : 0),
      )
    this.file = { ...this.file, runs }
    this.flush()
  }

  private flush(): void {
    writeFileSync(this.path, JSON.stringify(this.file, null, 2), 'utf-8')
  }

  private read(): TaskFile {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf-8'))
      const tasks = (parsed as { tasks?: unknown }).tasks
      const runs = (parsed as { runs?: unknown }).runs
      if ((parsed as { version?: unknown }).version !== 1 || !Array.isArray(tasks)) return emptyTaskFile()
      // Read one by one: a task whose schedule is nonsense costs the user that task, not the list.
      return { version: 1, tasks: tasks.filter(isTask), runs: Array.isArray(runs) ? runs.filter(isRun) : [] }
    } catch {
      return emptyTaskFile()
    }
  }
}

function isRun(value: unknown): value is TaskRun {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Partial<TaskRun>
  return (
    typeof run.taskId === 'string' &&
    typeof run.conversationId === 'string' &&
    typeof run.startedAt === 'number' &&
    Number.isFinite(run.startedAt) &&
    (run.endedAt === undefined || (typeof run.endedAt === 'number' && Number.isFinite(run.endedAt))) &&
    (run.outcome === 'running' || run.outcome === 'ok' || run.outcome === 'failed' || run.outcome === 'skipped') &&
    typeof run.refusals === 'number' &&
    Number.isInteger(run.refusals) &&
    run.refusals >= 0 &&
    (run.note === undefined || typeof run.note === 'string') &&
    (run.catchUp === undefined || typeof run.catchUp === 'boolean')
  )
}

function isTask(value: unknown): value is ScheduledTask {
  if (typeof value !== 'object' || value === null) return false
  const task = value as Partial<ScheduledTask>
  return (
    typeof task.id === 'string' &&
    typeof task.name === 'string' &&
    typeof task.prompt === 'string' &&
    typeof task.workspacePath === 'string' &&
    typeof task.enabled === 'boolean' &&
    typeof task.createdAt === 'number' &&
    typeof task.permissionLevel === 'string' &&
    isSchedule(task.schedule) &&
    isValidSchedule(task.schedule)
  )
}
