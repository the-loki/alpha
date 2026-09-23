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
  private recorded: TaskRun[] = []

  public constructor(dataDirectory: string) {
    this.path = join(dataDirectory, 'tasks.json')
    this.file = this.read()
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
    this.file = { version: 1, tasks }
    this.flush()
    return { ...task }
  }

  public remove(id: string): void {
    this.file = { version: 1, tasks: this.file.tasks.filter((entry) => entry.id !== id) }
    this.recorded = this.recorded.filter((run) => run.taskId !== id)
    this.flush()
  }

  /** When a task last ran, which is what its next run is measured from. */
  public markRan(id: string, at: number): void {
    const task = this.find(id)
    if (task !== undefined) this.save({ ...task, lastRunAt: at })
  }

  public runs(taskId: string): TaskRun[] {
    return this.recorded.filter((run) => run.taskId === taskId).map((run) => ({ ...run }))
  }

  /**
   * Adds a run row, keeping the newest: the conversations are the long history. A task has at most
   * one row for the run that is going, which the run replacing it — with the conversation it turned
   * out to be, and then with how it ended — takes with it.
   */
  public record(run: TaskRun): void {
    const kept = this.recorded.filter((existing) => existing.taskId !== run.taskId || existing.outcome !== 'running')
    this.recorded = [run, ...kept].slice(0, RUNS_KEPT)
  }

  private flush(): void {
    writeFileSync(this.path, JSON.stringify(this.file, null, 2), 'utf-8')
  }

  private read(): TaskFile {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf-8'))
      const tasks = (parsed as { tasks?: unknown }).tasks
      if ((parsed as { version?: unknown }).version !== 1 || !Array.isArray(tasks)) return emptyTaskFile()
      // Read one by one: a task whose schedule is nonsense costs the user that task, not the list.
      return { version: 1, tasks: tasks.filter(isTask) }
    } catch {
      return emptyTaskFile()
    }
  }
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
