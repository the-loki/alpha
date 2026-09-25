/**
 * A scheduled task: something the workbench does on its own. It has a name, a prompt, a folder,
 * the level it may act at, and a schedule (ADR-0013). Its runs are conversations like any other —
 * each one titled with the task's name — so what it did is read, continued and archived the way
 * everything else in the workbench is.
 */

import type { ConversationSummary } from './runtime-events.ts'
import type { TaskSchedule } from './schedule.ts'

export interface ScheduledTask {
  id: string
  /** Also the title of every conversation a run of it creates. */
  name: string
  /** The message the run is started with. */
  prompt: string
  workspacePath: string
  /** Defaults to `ask`; editing the task may change it independently of the workspace default. */
  permissionLevel: ConversationSummary['permissionLevel']
  schedule: TaskSchedule
  /** A task that is off keeps its prompt and its history and runs nothing. */
  enabled: boolean
  createdAt: number
  /** When the last run started, which is what the next one is measured from. */
  lastRunAt?: number
}

/** How a run ended, as far as the window needs to say it in one word. */
export type RunOutcome = 'running' | 'ok' | 'failed' | 'skipped'

export interface TaskRun {
  taskId: string
  /** Empty for a run that never started, which is what a skip is. */
  conversationId: string
  startedAt: number
  endedAt?: number
  outcome: RunOutcome
  /** Why it was skipped, in the words the task's own copy uses — a key, not a sentence. */
  note?: string
  /** Steps the gate refused because nobody was watching (ADR-0012). */
  refusals: number
  /** A run that stood in for one missed while the workbench was closed (ADR-0013). */
  catchUp?: boolean
}

/** How many runs a task remembers. The conversations themselves are the long history. */
export const RUNS_KEPT = 20

export interface TaskFile {
  version: 1
  tasks: ScheduledTask[]
  runs: TaskRun[]
}

export function emptyTaskFile(): TaskFile {
  return { version: 1, tasks: [], runs: [] }
}

/** The newest run that is still going, if one is: what keeps two runs of a task from overlapping. */
export function runningNow(task: ScheduledTask, runs: readonly TaskRun[]): boolean {
  return runs.some((run) => run.taskId === task.id && run.outcome === 'running')
}
