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
import { useNavigate } from '@solidjs/router'
import { createSignal, For, Show } from 'solid-js'
import { composerFolderOf, shell, useText } from '../../stores/shell.ts'
import { runsOf, taskActions, taskOf, tasks } from '../../stores/tasks.ts'
import { DESTRUCTIVE_ACTION, OUTLINED_ACTION, PRIMARY_ACTION, TEXT_ACTION } from '../controls.ts'
import { ClockIcon } from '../icons.tsx'
import { BAND } from '../ledger.ts'
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
function TaskRow(props: { task: ScheduledTask; onOpen: () => void }) {
  const t = useText()
  const next = () => nextRunAt(props.task.schedule, new Date(props.task.createdAt), props.task.lastRunAt)

  return (
    <li class="flex items-center gap-3 rounded-card border border-line bg-ink-800 px-4 py-3">
      <ClockIcon class="text-parchment-faint" />
      <div class="min-w-0 flex-1">
        <button type="button" onClick={props.onOpen} class="block w-full text-left">
          <span class="block truncate text-ui font-medium text-parchment">{props.task.name}</span>
          <span class="mt-0.5 block truncate font-mono text-micro text-parchment-faint">
            {scheduleText(t, props.task.schedule)} · {props.task.workspacePath}
          </span>
        </button>
        <span class="mt-1 block text-xs text-parchment-faint">
          {props.task.enabled ? t('tasks.nextRun', { when: formatUntil(next(), Date.now()) }) : t('tasks.stopped')}
        </span>
      </div>
      <button type="button" onClick={() => void taskActions.runNow(props.task.id)} class={OUTLINED_ACTION}>
        {t('tasks.runNow')}
      </button>
    </li>
  )
}

/** The runs a task remembers, newest first, each one a conversation that can be opened. */
function RunList(props: { runs: TaskRun[] }) {
  const t = useText()
  const navigate = useNavigate()

  return (
    <Show when={props.runs.length > 0} fallback={<p class="mt-2 text-xs text-parchment-faint">{t('tasks.noRuns')}</p>}>
      <ul class="mt-2 space-y-1">
        <For each={props.runs}>
          {(run) => (
            <li class="flex items-center gap-2 text-xs">
              <span class="font-mono text-micro text-parchment-faint">{runText(t, run)}</span>
              <Show when={run.catchUp === true}>
                <span class="font-mono text-micro text-parchment-faint">· {t('tasks.runCatchUp')}</span>
              </Show>
              <Show when={run.refusals > 0}>
                <span class="font-mono text-micro text-amber">· {t('tasks.runRefusals', { count: run.refusals })}</span>
              </Show>
              <Show when={run.note !== undefined}>
                <span class="text-parchment-faint">· {t('tasks.skipMissingFolder')}</span>
              </Show>
              <Show when={run.conversationId !== ''}>
                <button
                  type="button"
                  aria-label={t('tasks.openRun', { when: formatAge(run.startedAt, Date.now()) })}
                  onClick={() => navigate(`/c/${run.conversationId}`)}
                  class={TEXT_ACTION}
                >
                  {t('tasks.open')}
                </button>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}

/** What a task's level means when nobody is there to answer a question (ADR-0012). */
function levelNote(t: ReturnType<typeof useText>, level: PermissionLevel): Undef<string> {
  if (level === 'ask' || level === 'accept-edits') return t('tasks.levelAsk')
  if (level === 'full-access') return t('tasks.levelFull')
  return undefined
}

export function TasksPage() {
  const t = useText()
  const [editing, setEditing] = createSignal<Undef<string>>(undefined)
  const [form, setForm] = createSignal<Undef<Partial<ScheduledTask>>>(undefined)
  const draft = () => form() ?? {}
  const current = () => {
    const id = editing()
    return id === undefined ? undefined : taskOf(id)
  }
  const note = () => levelNote(t, draft().permissionLevel ?? 'ask')

  const start = (task?: ScheduledTask) => {
    setEditing(task?.id ?? '')
    setForm(task ?? { workspacePath: composerFolderOf(shell)?.path ?? '', schedule: { kind: 'daily', at: '09:00' } })
  }

  return (
    <div class="flex h-full min-h-0 flex-col">
      {/* The page's band: what this page is, and the one thing you do to the page itself — the same
          band, height and padding the conversation head and a settings panel wear, so the title
          stands on the same x and the same y wherever you are (C5.4). */}
      <header class={BAND}>
        <h1 class="min-w-0 truncate font-display text-xl font-medium text-parchment">{t('tasks.title')}</h1>
        <button type="button" onClick={() => start()} class={PRIMARY_ACTION}>
          {t('tasks.new')}
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {/* What this page is for, on the measure the prose keeps: the band's rule is what separates
            the page's head from its body, so the first line of the body draws no rule of its own. */}
        <p class="max-w-measure text-xs leading-relaxed text-parchment-dim">{t('tasks.intro')}</p>

        <Show when={form() !== undefined}>
          <TaskForm
            form={draft()}
            note={note()}
            onChange={(changes) => setForm((previous) => ({ ...previous, ...changes }))}
            onCancel={() => {
              setForm(undefined)
              setEditing(undefined)
            }}
            onSave={async () => {
              await taskActions.save({ ...draft(), id: editing() === '' ? undefined : editing() })
              setForm(undefined)
              setEditing(undefined)
            }}
          />
        </Show>

        <Show
          when={tasks.tasks.length === 0}
          fallback={
            <ul class="mt-5 space-y-2">
              <For each={tasks.tasks}>{(task) => <TaskRow task={task} onOpen={() => start(task)} />}</For>
            </ul>
          }
        >
          <Show when={tasks.listed}>
            <div class="mt-6 rounded-card border border-line bg-ink-800 px-4 py-6">
              <p class="text-ui text-parchment">{t('tasks.empty')}</p>
              <p class="mt-1 text-xs leading-relaxed text-parchment-dim">{t('tasks.emptyBody')}</p>
            </div>
          </Show>
        </Show>

        <Show when={current()}>
          {(task) => (
            <section aria-labelledby="task-history" class="mt-6">
              <h2 id="task-history" class="text-body font-medium text-parchment">
                {t('tasks.history')}
              </h2>
              <RunList runs={runsOf(task().id)} />
              <div class="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => void taskActions.save({ id: task().id, enabled: !task().enabled })}
                  class={OUTLINED_ACTION}
                >
                  {t(task().enabled ? 'tasks.stop' : 'tasks.start')}
                </button>
                <button type="button" onClick={() => void taskActions.remove(task().id)} class={DESTRUCTIVE_ACTION}>
                  {t('tasks.delete')}
                </button>
              </div>
            </section>
          )}
        </Show>
      </div>
    </div>
  )
}
