/**
 * The clock the workbench keeps (ADR-0013): one timer, set to the nearest moment any task wants,
 * re-armed after every wake. There is no daemon — tasks fire while the process is running, which
 * on macOS outlives the window and elsewhere does not — and a moment that passed while the
 * workbench was closed is caught up **once**, promptly after it starts, never replayed as a burst.
 *
 * One task runs at a time. A run that arrives while its own task is still going is skipped and
 * recorded, because two runs touch the same folder and the second was written for the state the
 * first is in the middle of changing.
 */
import { runDue, type ScheduledTask, type TaskRun, type Undef } from '@alpha/domain'
import type { TaskStore } from './store.ts'

export interface RunOutcome {
  conversationId: string
  outcome: Exclude<TaskRun['outcome'], 'running' | 'skipped'>
  refusals: number
}

/** Called once the run has a conversation, so the row can name it while the turn is still going. */
export type RunStarted = (conversationId: string) => void

export interface SchedulerPorts {
  tasks: TaskStore
  /** A folder that is no longer there is a skip with a reason, not a failure. */
  workspaceExists: (path: string) => boolean
  /** Starts the run and answers when that turn is over. */
  run: (task: ScheduledTask, started: RunStarted) => Promise<RunOutcome>
  runs: (run: TaskRun) => void
  /** Told when the tasks or their runs change, so a window that is open can follow along. */
  changed: () => void
  now: () => Date
}

/** How long after starting to look for missed work: long enough for the window to be up. */
const CATCH_UP_DELAY_MS = 2_000
/** A very long timer is a very long timer; waking once a day costs nothing. */
const LONGEST_WAIT_MS = 60 * 60_000

export class Scheduler {
  readonly #ports: SchedulerPorts
  #timer: Undef<ReturnType<typeof setTimeout>>
  #running = false

  public constructor(ports: SchedulerPorts) {
    this.#ports = ports
  }

  public start(): void {
    this.stop()
    const gap = Math.min(CATCH_UP_DELAY_MS, this.#waitForNext())
    this.#timer = setTimeout(() => void this.tick(), gap)
  }

  public stop(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer)
    this.#timer = undefined
  }

  /** One pass over every task, then a timer for the nearest moment left. Called by the timer too. */
  public async tick(): Promise<void> {
    if (this.#running) return
    const now = this.#ports.now()
    for (const task of this.#ports.tasks.list()) {
      if (!task.enabled) continue
      const due = runDue(task.schedule, new Date(task.createdAt), now, task.lastRunAt)
      if (due === undefined) continue
      await this.#runOne(task, due)
    }
    this.start()
  }

  async #runOne(task: ScheduledTask, due: number): Promise<void> {
    const catchUp = this.#missedBy(task, due)
    if (!this.#ports.workspaceExists(task.workspacePath)) {
      this.#ports.runs({
        taskId: task.id,
        conversationId: '',
        startedAt: due,
        outcome: 'skipped',
        note: 'missingFolder',
        refusals: 0,
      })
      this.#ports.tasks.markRan(task.id, due)
      this.#ports.changed()
      return
    }

    this.#running = true
    this.#ports.tasks.markRan(task.id, due)
    const row: TaskRun = {
      taskId: task.id,
      conversationId: '',
      startedAt: due,
      outcome: 'running',
      refusals: 0,
      catchUp,
    }
    this.#ports.runs(row)
    this.#ports.changed()
    try {
      const outcome = await this.#ports.run(task, (conversationId) => {
        this.#ports.runs({ ...row, conversationId })
        this.#ports.changed()
      })
      this.#ports.runs({
        taskId: task.id,
        conversationId: outcome.conversationId,
        startedAt: due,
        endedAt: this.#ports.now().getTime(),
        outcome: outcome.outcome,
        refusals: outcome.refusals,
        catchUp,
      })
    } finally {
      this.#running = false
      this.#ports.changed()
    }
  }

  /**
   * Whether this run is standing in for one that was missed, rather than being the one that was
   * due. A minute of timer drift is not a missed run; a whole occurrence that never happened is.
   */
  #missedBy(task: ScheduledTask, due: number): boolean {
    const gap = due - (task.lastRunAt ?? task.createdAt)
    if (task.schedule.kind === 'every') return gap >= task.schedule.minutes * 60_000 * 2
    return gap > 24 * 60 * 60_000
  }

  /** How long until the nearest moment any task wants, or a long wait when none do. */
  #waitForNext(): number {
    const now = this.#ports.now()
    const waits = this.#ports.tasks
      .list()
      .filter((task) => task.enabled)
      .map((task) => {
        const due = runDue(task.schedule, new Date(task.createdAt), now, task.lastRunAt)
        if (due !== undefined) return 0
        const next =
          task.schedule.kind === 'every'
            ? (task.lastRunAt ?? task.createdAt) + task.schedule.minutes * 60_000
            : new Date(now.getTime() + 24 * 60 * 60_000).getTime()
        return Math.max(1_000, next - now.getTime())
      })
    return waits.length === 0 ? LONGEST_WAIT_MS : Math.min(...waits, LONGEST_WAIT_MS)
  }
}
