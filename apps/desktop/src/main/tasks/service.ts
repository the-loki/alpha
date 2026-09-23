/**
 * Scheduled tasks, as the window sees them: the list, one task's runs, and the two ways a run
 * starts — the clock (ADR-0013) and the button that means "now, while I am watching" (ADR-0012).
 * A run is an ordinary conversation in the task's folder, titled with the task's name, so what a
 * task did is read, continued and archived like anything else.
 */
import {
  DEFAULT_SCHEDULE,
  isValidSchedule,
  type PermissionLevel,
  type ScheduledTask,
  type TaskRun,
  type TaskSchedule,
  type TasksSnapshot,
} from '@alpha/domain'
import { type RunOutcome, type RunStarted, Scheduler } from './scheduler.ts'
import type { TaskStore } from './store.ts'

export interface TaskServicePorts {
  tasks: TaskStore
  create: (workspacePath: string) => Promise<string>
  rename: (conversationId: string, title: string) => void
  /** The level the run acts at, which is the task's own and not the folder's default (ADR-0012). */
  setLevel: (conversationId: string, level: PermissionLevel) => void
  /** One turn with nobody watching; answers with how many steps the gate had to refuse. */
  runUnattended: (conversationId: string, text: string) => Promise<number>
  /** One turn with the person who pressed "run now" watching, so the gate may ask. */
  prompt: (conversationId: string, text: string) => Promise<void>
  workspaceExists: (path: string) => boolean
  changed: () => void
  now: () => Date
}

export class TaskService {
  readonly #ports: TaskServicePorts
  readonly #scheduler: Scheduler

  constructor(ports: TaskServicePorts) {
    this.#ports = ports
    this.#scheduler = new Scheduler({
      tasks: ports.tasks,
      workspaceExists: ports.workspaceExists,
      run: (task, started) => this.#run(task, false, started),
      runs: (run) => ports.tasks.record(run),
      changed: ports.changed,
      now: ports.now,
    })
  }

  start(): void {
    this.#scheduler.start()
  }

  stop(): void {
    this.#scheduler.stop()
  }

  snapshot(): TasksSnapshot {
    const tasks = this.#ports.tasks.list()
    return { tasks, runs: tasks.flatMap((task) => this.#ports.tasks.runs(task.id)) }
  }

  /**
   * A new task or an edit of one. An edit keeps the id, and a task's level is its own from the
   * moment it is made: a workspace's default may move, a promise already made may not (ADR-0012).
   */
  save(input: Partial<ScheduledTask>): TasksSnapshot {
    const existing = input.id === undefined ? undefined : this.#ports.tasks.find(input.id)
    const schedule: TaskSchedule = isValidSchedule(input.schedule)
      ? input.schedule
      : (existing?.schedule ?? DEFAULT_SCHEDULE)
    const task: ScheduledTask = {
      id: existing?.id ?? crypto.randomUUID(),
      name: (input.name ?? existing?.name ?? '').trim(),
      prompt: (input.prompt ?? existing?.prompt ?? '').trim(),
      workspacePath: input.workspacePath ?? existing?.workspacePath ?? '',
      permissionLevel: input.permissionLevel ?? existing?.permissionLevel ?? 'ask',
      schedule,
      enabled: input.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? this.#ports.now().getTime(),
      ...(existing?.lastRunAt === undefined ? {} : { lastRunAt: existing.lastRunAt }),
    }
    if (task.name === '' || task.prompt === '' || task.workspacePath === '') {
      throw new Error('A task needs a name, a prompt, and a folder to run in.')
    }
    this.#ports.tasks.save(task)
    this.#ports.changed()
    return this.snapshot()
  }

  remove(id: string): TasksSnapshot {
    this.#ports.tasks.remove(id)
    this.#ports.changed()
    return this.snapshot()
  }

  /** Run now: the person pressing it is watching, so the gate may ask (ADR-0012). */
  async runNow(id: string): Promise<TasksSnapshot> {
    const task = this.#ports.tasks.find(id)
    if (task === undefined) throw new Error(`No task ${id}`)
    // A run started by hand is written down the same way the clock's runs are: one row, started
    // and then ended, so a task's history does not depend on who started it.
    const row: TaskRun = {
      taskId: task.id,
      conversationId: '',
      startedAt: this.#ports.now().getTime(),
      outcome: 'running',
      refusals: 0,
    }
    this.#ports.tasks.record(row)
    this.#ports.changed()
    const outcome = await this.#run(task, true, (conversationId) => {
      this.#ports.tasks.record({ ...row, conversationId })
      this.#ports.changed()
    })
    this.#ports.tasks.record({
      ...row,
      conversationId: outcome.conversationId,
      outcome: outcome.outcome,
      refusals: outcome.refusals,
      endedAt: this.#ports.now().getTime(),
    })
    this.#ports.changed()
    return this.snapshot()
  }

  /**
   * One run: a conversation titled with the task's name, the prompt as its first message, and the
   * outcome answered back. A run that throws is a failed run — the conversation holds the reason,
   * and the task's history says how it went.
   */
  async #run(task: ScheduledTask, attended: boolean, started: RunStarted = () => undefined): Promise<RunOutcome> {
    const conversationId = await this.#ports.create(task.workspacePath)
    this.#ports.rename(conversationId, task.name)
    this.#ports.setLevel(conversationId, task.permissionLevel)
    started(conversationId)
    try {
      const refusals = attended ? 0 : await this.#ports.runUnattended(conversationId, task.prompt)
      if (attended) await this.#ports.prompt(conversationId, task.prompt)
      return { conversationId, outcome: 'ok', refusals }
    } catch {
      return { conversationId, outcome: 'failed', refusals: 0 }
    }
  }
}
