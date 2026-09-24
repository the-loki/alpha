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
const starting = new Set<(snapshot: TasksSnapshot) => void>()

export { tasks }

const apply = (snapshot: TasksSnapshot): void => {
  setTasks({ tasks: snapshot.tasks, runs: snapshot.runs, listed: true })
  for (const notify of starting) notify(snapshot)
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

  runNow: (id: string): Promise<Undef<string>> => {
    const known = new Set(runsOf(id).map((run) => run.conversationId))
    return new Promise((resolve, reject) => {
      const finish = (conversationId: Undef<string>): void => {
        starting.delete(onChange)
        resolve(conversationId)
      }
      const onChange = (snapshot: TasksSnapshot): void => {
        const run = snapshot.runs.find(
          (entry) => entry.taskId === id && entry.conversationId !== '' && !known.has(entry.conversationId),
        )
        if (run !== undefined) finish(run.conversationId)
      }
      starting.add(onChange)
      void bridge()
        .runTaskNow(id)
        .then(
          (snapshot) => {
            apply(snapshot)
            finish(undefined)
          },
          (error: unknown) => {
            starting.delete(onChange)
            reject(error)
          },
        )
    })
  },
}

/** The runs of one task, newest first, which is what its own page lists. */
export const runsOf = (id: string): TaskRun[] => tasks.runs.filter((run) => run.taskId === id)

/** One task by id, for a page that was opened on it. */
export const taskOf = (id: string): Undef<ScheduledTask> => tasks.tasks.find((task) => task.id === id)
