import {
  formatAge,
  formatUntil,
  nextRunAt,
  type PermissionLevel,
  type ScheduledTask,
  type TaskRun,
  type TaskSchedule,
  type Undef,
} from '@alpha/domain'
import { useNavigate } from '@solidjs/router'
import { createSignal, For, Show } from 'solid-js'
import { composerFolderOf, shell, useText } from '../../stores/shell.ts'
import { runsOf, taskActions, taskOf, tasks } from '../../stores/tasks.ts'
import {
  DESTRUCTIVE_ACTION,
  GROUP_LABEL,
  OUTLINED_ACTION,
  PRIMARY_ACTION,
  ROW_HOVER,
  TEXT_ACTION,
} from '../controls.ts'
import { ClockIcon } from '../icons.tsx'
import { BAND, BESIDE_SCROLLS, FORM_COLUMN, PAGE, SCROLLS } from '../ledger.ts'
import { RailToggle, WindowControls } from '../TitleBar.tsx'
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
    <li class="relative flex items-center gap-3 rounded-lg border border-line bg-surface-0 px-4 py-3">
      <ClockIcon class="text-faint" />
      {/* The record is the control that opens the task: one button over the whole of it, so the hand
          is answered wherever it lands on the record rather than only over its words (C5.6). */}
      <button
        type="button"
        onClick={props.onOpen}
        class={`absolute inset-0 transition-colors ${ROW_HOVER}`}
        aria-label={props.task.name}
      />
      <div class="min-w-0 flex-1">
        <span class="block truncate font-text text-name text-foreground">{props.task.name}</span>
        <span class="mt-0.5 block truncate font-mono text-label text-faint">
          {scheduleText(t, props.task.schedule)} · {props.task.workspacePath}
        </span>
        <span class="mt-1 block font-mono text-label text-faint">
          {props.task.enabled ? t('tasks.nextRun', { when: formatUntil(next(), Date.now()) }) : t('tasks.stopped')}
        </span>
      </div>
      <button type="button" onClick={() => void taskActions.runNow(props.task.id)} class={`relative ${TEXT_ACTION}`}>
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
    <Show
      when={props.runs.length > 0}
      fallback={<p class="mt-2 font-text text-name text-faint">{t('tasks.noRuns')}</p>}
    >
      <ul class="mt-2 space-y-1">
        <For each={props.runs}>
          {(run) => (
            <li class="flex items-center gap-2">
              <span class="font-mono text-label text-faint">{runText(t, run)}</span>
              <Show when={run.catchUp === true}>
                <span class="font-mono text-label text-faint">· {t('tasks.runCatchUp')}</span>
              </Show>
              <Show when={run.refusals > 0}>
                <span class="font-mono text-label text-warning">
                  · {t('tasks.runRefusals', { count: run.refusals })}
                </span>
              </Show>
              <Show when={run.note !== undefined}>
                <span class="font-mono text-label text-faint">· {t('tasks.skipMissingFolder')}</span>
              </Show>
              <Show when={run.conversationId !== ''}>
                <button
                  type="button"
                  aria-label={t('tasks.openRun', {
                    when: formatAge(run.startedAt, Date.now()),
                  })}
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
    setForm(
      task ?? {
        workspacePath: composerFolderOf(shell)?.path ?? '',
        schedule: { kind: 'daily', at: '09:00' },
      },
    )
  }

  return (
    <div class="flex h-full min-h-0 flex-col">
      {/* The view head: what this page is, the one thing you do to the page itself, and the rail's
          toggle at its left end — the same head, height and padding the conversation and a settings
          panel wear, so the title stands on the same x and the same y wherever you are (C5.4). The
          toggle stands in the head's own left padding, outside the row, so it moves nothing. */}
      <header class={`${BAND} ${BESIDE_SCROLLS}`}>
        <span class="no-drag absolute top-1/2 left-0 -translate-y-1/2">
          <RailToggle />
        </span>
        <h1 class="min-w-0 flex-1 truncate font-text text-title font-semibold tracking-tight text-foreground">
          {t('tasks.title')}
        </h1>
        <button type="button" onClick={() => start()} class={`no-drag ${PRIMARY_ACTION}`}>
          {t('tasks.new')}
        </button>
        {/* What acts on the window is not one of the page's concerns: at the corner itself. */}
        <span class="no-drag -mr-8 flex shrink-0 items-center">
          <WindowControls />
        </span>
      </header>

      {/* The page's body, on the page's own edges: what this page holds fills the pane the rail
          leaves, one padding in, on the same x the view head's title stands on — growing the
          window gives the fields room and never moves the page's edge (C5.3). */}
      <div class={`min-h-0 flex-1 py-6 ${PAGE} ${SCROLLS}`}>
        <div class={FORM_COLUMN} data-column="form">
          {/* What this page is for, on the measure a sentence of the interface keeps: the view
              head's hairline separates the page's head from its body, so this draws no rule of its
              own. */}
          <p class="max-w-measure font-text text-body text-muted">{t('tasks.intro')}</p>

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
                await taskActions.save({
                  ...draft(),
                  id: editing() === '' ? undefined : editing(),
                })
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
              <div class="mt-6 rounded-lg border border-line bg-surface-0 p-4">
                <p class="font-text text-display text-foreground">{t('tasks.empty')}</p>
                <p class="mt-1 max-w-measure font-text text-body text-muted">{t('tasks.emptyBody')}</p>
              </div>
            </Show>
          </Show>

          <Show when={current()}>
            {(task) => (
              <section aria-labelledby="task-history" class="mt-6">
                <h2 id="task-history" class={GROUP_LABEL}>
                  {t('tasks.history')}
                </h2>
                <RunList runs={runsOf(task().id)} />
                <div class="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      void taskActions.save({
                        id: task().id,
                        enabled: !task().enabled,
                      })
                    }
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
    </div>
  )
}
