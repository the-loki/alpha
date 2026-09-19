import type { ScheduledTask, TaskRun, TasksSnapshot, Undef } from '@alpha/core'
import { create } from 'zustand'
import { bridge } from '../lib/bridge.ts'

interface TaskStore {
  tasks: ScheduledTask[]
  runs: TaskRun[]
  /** Whether the window has heard from main yet: before that, "no tasks" would be a guess. */
  listed: boolean
  /** Every task the workbench knows, and the runs they remember. */
  apply: (snapshot: TasksSnapshot) => void
  save: (input: Partial<ScheduledTask>) => Promise<void>
  remove: (id: string) => Promise<void>
  runNow: (id: string) => Promise<void>
  /** The runs of one task, newest first, which is what its own page lists. */
  runsOf: (id: string) => TaskRun[]
}

export const useTasks = create<TaskStore>((set, get) => ({
  tasks: [],
  runs: [],
  listed: false,

  apply: (snapshot) => set({ tasks: snapshot.tasks, runs: snapshot.runs, listed: true }),

  save: async (input) => set({ ...(await bridge().saveTask(input)), listed: true }),

  remove: async (id) => set({ ...(await bridge().deleteTask(id)), listed: true }),

  runNow: async (id) => set({ ...(await bridge().runTaskNow(id)), listed: true }),

  runsOf: (id) => get().runs.filter((run) => run.taskId === id),
}))

/** One task by id, for a page that was opened on it. */
export const taskOf = (tasks: ScheduledTask[], id: string): Undef<ScheduledTask> => tasks.find((task) => task.id === id)
