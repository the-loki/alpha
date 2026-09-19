/**
 * What the window is handed when it asks about tasks: the tasks themselves and the runs they
 * remember. It lives in the contract's vocabulary rather than in the main process, because both
 * sides have to agree on its shape and neither owns it.
 */
import type { ScheduledTask, TaskRun } from './task.ts'

export interface TasksSnapshot {
  tasks: ScheduledTask[]
  /** The recent runs of every task, newest first: enough for a task's own history. */
  runs: TaskRun[]
}
