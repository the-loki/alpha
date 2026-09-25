/**
 * The third level of the rail: a folder's tasks, and under each one the conversations its runs
 * made. A run is an ordinary conversation (ADR-0013), so this only joins the two lists the window
 * already has — the runs a task remembers, and the conversations that are still there.
 */

import type { TextKey } from '@alpha/i18n'
import type { Undef } from './maybe.ts'
import type { ConversationSummary } from './runtime-events.ts'
import type { ScheduledTask, TaskRun } from './task.ts'

export interface TaskNode {
  task: ScheduledTask
  /** Newest first, and only the ones still in the tree: an archived run lives in that section. */
  runs: ConversationSummary[]
  lastRun: Undef<TaskRun>
}

/** The newest run of a task, which is what a folded task says the outcome of. */
export function lastRunOf(runs: TaskRun[]): Undef<TaskRun> {
  return [...runs].sort((left, right) => right.startedAt - left.startedAt)[0]
}

/** One line for a run, as a key and the number it needs: the window turns it into words. */
export type RunVerdict = { key: TextKey; count?: number }

/**
 * What a folded task says in one phrase: a failed, skipped or running state takes precedence over
 * gate refusals; for a successful run, the refusal count explains work it could not do.
 */
export function newTaskRun(run: Undef<TaskRun>): Undef<RunVerdict> {
  if (run === undefined) return undefined
  if (run.outcome === 'failed') return { key: 'tasks.runFailed' }
  if (run.outcome === 'skipped') return { key: 'tasks.runSkipped' }
  if (run.outcome === 'running') return { key: 'tasks.runRunning' }
  if (run.refusals > 0) return { key: 'tasks.runRefusals', count: run.refusals }
  return { key: 'tasks.runOk' }
}

/**
 * The conversations that are nobody's run. A run belongs under its task, so the folder's own list
 * — and the count on its row — is what was asked by hand: a daily task must not turn the folder
 * into a list of the same title.
 */
export function withoutRuns(conversations: ConversationSummary[], runs: TaskRun[]): ConversationSummary[] {
  const made = new Set(runs.map((run) => run.conversationId))
  return conversations.filter((conversation) => !made.has(conversation.id))
}

/** The tasks that run in one folder, each with the conversations it has made there. */
export function folderTasks(
  tasks: ScheduledTask[],
  runs: TaskRun[],
  conversations: ConversationSummary[],
  folderPath: string,
): TaskNode[] {
  const mine = conversations.filter((conversation) => conversation.archivedAt === undefined)
  return tasks
    .filter((task) => task.workspacePath === folderPath)
    .map((task) => {
      const own = runs.filter((run) => run.taskId === task.id)
      const made = own
        .map((run) => mine.find((conversation) => conversation.id === run.conversationId))
        .filter((conversation): conversation is ConversationSummary => conversation !== undefined)
        .sort((left, right) => right.updatedAt - left.updatedAt)
      return { task, runs: made, lastRun: lastRunOf(own) }
    })
}
