import {
  formatAge,
  formatUntil,
  nextRunAt,
  type PermissionLevel,
  type ScheduledTask,
  type TaskRun,
  type TaskSchedule,
  type Undef,
} from '@alpha/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { composerFolderOf, useShell, useText } from '../../stores/shell.ts'
import { taskOf, useTasks } from '../../stores/tasks.ts'
import { DESTRUCTIVE_ACTION, OUTLINED_ACTION, PRIMARY_ACTION, TEXT_ACTION } from '../controls.ts'
import { ClockIcon } from '../icons.tsx'
import { TaskForm } from './TaskForm.tsx'

function scheduleText(t: ReturnType<typeof useText>, schedule: TaskSchedule): string {
  return schedule.kind === 'daily'
    ? t('tasks.dailyAt', { time: schedule.at })
    : t('tasks.everyMinutes', { count: schedule.minutes })
}

function runText(t: ReturnType<typeof useText>, run: TaskRun): string {
  const when = formatAge(run.startedAt, Date.now())
  return run.outcome === 'running' ? t('tasks.runRunning') : `${when} · ${t(runKey(run))}`
}

const runKey = (run: TaskRun) =>
  run.outcome === 'ok'
    ? 'tasks.runOk'
    : run.outcome === 'failed'
      ? 'tasks.runFailed'
      : run.outcome === 'skipped'
        ? 'tasks.runSkipped'
        : 'tasks.runRunning'

/** One task in the list: what it is, when it next runs, and the two things you do to it. */
function TaskRow({ task, onOpen }: { task: ScheduledTask; onOpen: () => void }) {
  const t = useText()
  const runNow = useTasks((state) => state.runNow)
  const next = nextRunAt(task.schedule, new Date(task.createdAt), task.lastRunAt)

  return (
    <li className="flex items-center gap-3 rounded-card border border-line bg-ink-800 px-4 py-3">
      <ClockIcon className="text-parchment-faint" />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="block w-full text-left">
          <span className="block truncate text-ui font-medium text-parchment">{task.name}</span>
          <span className="mt-0.5 block truncate font-mono text-micro text-parchment-faint">
            {scheduleText(t, task.schedule)} · {task.workspacePath}
          </span>
        </button>
        <span className="mt-1 block text-xs text-parchment-faint">
          {task.enabled ? t('tasks.nextRun', { when: formatUntil(next, Date.now()) }) : t('tasks.stopped')}
        </span>
      </div>
      <button type="button" onClick={() => void runNow(task.id)} className={OUTLINED_ACTION}>
        {t('tasks.runNow')}
      </button>
    </li>
  )
}

/** The runs a task remembers, newest first, each one a conversation that can be opened. */
function RunList({ runs }: { runs: TaskRun[] }) {
  const t = useText()
  const navigate = useNavigate()
  if (runs.length === 0) return <p className="mt-2 text-xs text-parchment-faint">{t('tasks.noRuns')}</p>

  return (
    <ul className="mt-2 space-y-1">
      {runs.map((run) => (
        <li key={`${run.startedAt}-${run.conversationId}`} className="flex items-center gap-2 text-xs">
          <span className="font-mono text-micro text-parchment-faint">{runText(t, run)}</span>
          {run.catchUp === true && (
            <span className="font-mono text-micro text-parchment-faint">· {t('tasks.runCatchUp')}</span>
          )}
          {run.refusals > 0 && (
            <span className="font-mono text-micro text-amber">· {t('tasks.runRefusals', { count: run.refusals })}</span>
          )}
          {run.note !== undefined && <span className="text-parchment-faint">· {t('tasks.skipMissingFolder')}</span>}
          {run.conversationId !== '' && (
            <button
              type="button"
              aria-label={t('tasks.openRun', { when: formatAge(run.startedAt, Date.now()) })}
              onClick={() =>
                void navigate({ to: '/c/$conversationId', params: { conversationId: run.conversationId } })
              }
              className={TEXT_ACTION}
            >
              {t('tasks.open')}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** What a task's level means when nobody is there to answer a question (ADR-0012). */
function levelNote(t: ReturnType<typeof useText>, level: PermissionLevel): Undef<string> {
  if (level === 'ask' || level === 'accept-edits') return t('tasks.levelAsk')
  if (level === 'full-access') return t('tasks.levelFull')
  return undefined
}

export function TasksPage() {
  const tasks = useTasks((state) => state.tasks)
  const listed = useTasks((state) => state.listed)
  const runsOf = useTasks((state) => state.runsOf)
  const remove = useTasks((state) => state.remove)
  const save = useTasks((state) => state.save)
  const composerFolder = useShell(composerFolderOf)
  const t = useText()
  const [editing, setEditing] = useState<Undef<string>>(undefined)
  const [form, setForm] = useState<Undef<Partial<ScheduledTask>>>(undefined)
  const current = editing === undefined ? undefined : taskOf(tasks, editing)

  const start = (task?: ScheduledTask) => {
    setEditing(task?.id ?? '')
    setForm(task ?? { workspacePath: composerFolder?.path ?? '', schedule: { kind: 'daily', at: '09:00' } })
  }

  const draft = form ?? {}
  const note = levelNote(t, draft.permissionLevel ?? 'ask')

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-parchment">{t('tasks.title')}</h1>
        <button type="button" onClick={() => start()} className={PRIMARY_ACTION}>
          {t('tasks.new')}
        </button>
      </div>
      {/* The page's own band: what this page is, then a rule, then the tasks it holds — the same
          shape the settings panel and the conversation header use. */}
      <p className="mt-2 border-b border-line pb-4 text-xs leading-relaxed text-parchment-dim">{t('tasks.intro')}</p>

      {form !== undefined && (
        <TaskForm
          form={draft}
          note={note}
          onChange={(changes) => setForm({ ...draft, ...changes })}
          onCancel={() => {
            setForm(undefined)
            setEditing(undefined)
          }}
          onSave={async () => {
            await save({ ...draft, id: editing === '' ? undefined : editing })
            setForm(undefined)
            setEditing(undefined)
          }}
        />
      )}

      {tasks.length === 0 ? (
        listed && (
          <div className="mt-6 rounded-card border border-line bg-ink-800 px-4 py-6">
            <p className="text-ui text-parchment">{t('tasks.empty')}</p>
            <p className="mt-1 text-xs leading-relaxed text-parchment-dim">{t('tasks.emptyBody')}</p>
          </div>
        )
      ) : (
        <ul className="mt-5 space-y-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={() => start(task)} />
          ))}
        </ul>
      )}

      {current !== undefined && (
        <section aria-labelledby="task-history" className="mt-6">
          <h2 id="task-history" className="text-body font-medium text-parchment">
            {t('tasks.history')}
          </h2>
          <RunList runs={runsOf(current.id)} />
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void save({ id: current.id, enabled: !current.enabled })}
              className={OUTLINED_ACTION}
            >
              {t(current.enabled ? 'tasks.stop' : 'tasks.start')}
            </button>
            <button type="button" onClick={() => void remove(current.id)} className={DESTRUCTIVE_ACTION}>
              {t('tasks.delete')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
