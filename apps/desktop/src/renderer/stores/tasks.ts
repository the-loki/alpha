import type { ScheduledTask, TaskRun, TasksSnapshot, Undef } from '@alpha/domain'
import { createStore } from 'solid-js/store'
import { bridge } from '../lib/bridge.ts'

export interface TasksState {
  tasks: ScheduledTask[]
  runs: TaskRun[]
  /** Whether the window has heard from main yet: before that, "no tasks" would be a guess. */
  listed: boolean
}

/** Every task the workbench knows, and the runs they remember. */
const [tasks, setTasks] = createStore<TasksState>({ tasks: [], runs: [], listed: false })

export { tasks }

const apply = (snapshot: TasksSnapshot): void => {
  setTasks({ tasks: snapshot.tasks, runs: snapshot.runs, listed: true })
}

export const taskActions = {
  /** The whole list, as main pushes it: the window never assembles one of its own. */
  apply,

  save: async (input: Partial<ScheduledTask>): Promise<void> => {
    apply(await bridge().saveTask(input))
  },

  remove: async (id: string): Promise<void> => {
    apply(await bridge().deleteTask(id))
  },

  runNow: async (id: string): Promise<void> => {
    apply(await bridge().runTaskNow(id))
  },
}

/** The runs of one task, newest first, which is what its own page lists. */
export const runsOf = (id: string): TaskRun[] => tasks.runs.filter((run) => run.taskId === id)

/** One task by id, for a page that was opened on it. */
export const taskOf = (id: string): Undef<ScheduledTask> => tasks.tasks.find((task) => task.id === id)
