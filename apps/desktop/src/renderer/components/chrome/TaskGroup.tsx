import { formatAge, newTaskRun, type RunVerdict, runningNow, type TaskNode } from '@alpha/domain'
import { useNavigate } from '@solidjs/router'
import { createSignal, For, Show } from 'solid-js'
import { useText } from '../../stores/shell.ts'
import { taskActions, tasks } from '../../stores/tasks.ts'
import { RAIL_ROW, RAIL_STEP, TEXT_ACTION } from '../controls.ts'
import { ClockIcon } from '../icons.tsx'
import { ConversationRow } from './ConversationRow.tsx'

/** How many of a task's runs the rail shows; the task's own page holds the rest. */
const SHOWN_RUNS = 5

/**
 * One task, in the folder it runs in, with the conversations its runs made beneath it — the third
 * level of the rail (ticket #85). Folding it is what keeps a daily task from filling the sidebar
 * with a month of the same title, so the folded row has to say how the last run went: a task that
 * has been failing all week must not look like one that has been fine.
 */
export function TaskGroup(props: { node: TaskNode }) {
  const t = useText()
  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)
  const [all, setAll] = createSignal(false)
  const active = () => runningNow(props.node.task, tasks.runs)
  const verdict = () => newTaskRun(props.node.lastRun)
  const shown = () => (all() ? props.node.runs : props.node.runs.slice(0, SHOWN_RUNS))
  const hidden = () => props.node.runs.length - shown().length
  const runNow = async () => {
    const conversationId = await taskActions.runNow(props.node.task.id)
    if (conversationId !== undefined) navigate(`/c/${conversationId}`)
  }
  // The word at the end of the row, in the colour the transcript uses for the same fact: danger
  // for what failed, accent for a run in flight, warning for what waits, faint for no word at
  // all (C5.2).
  const tone = () => {
    const current = verdict()
    if (current === undefined) return 'text-faint'
    if (current.key === 'tasks.runFailed') return 'text-danger'
    if (current.key === 'tasks.runRunning') return 'text-accent'
    return current.count === undefined ? 'text-faint' : 'text-warning'
  }

  return (
    <div class={`mt-1 ${RAIL_STEP}`}>
      <div class="group flex items-center gap-1">
        <h3 class="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open()}
            aria-label={t(open() ? 'sidebar.collapseTasks' : 'sidebar.expandTasks', { folder: props.node.task.name })}
            onClick={() => setOpen((value) => !value)}
            class={`flex w-full min-w-0 items-center rounded-md py-1.5 text-left text-muted transition-colors duration-normal hover:bg-surface-2 hover:text-foreground ${RAIL_ROW}`}
          >
            {/* The task's glyph, then its name in the text voice. One step in from the folder,
                because a task runs *in* a folder and is held by it: drawn on the folder's own x it
                reads as another folder, and the runs under it would have no level of their own to
                stand on (C5.4). */}
            <ClockIcon class="shrink-0 text-faint" />
            <span class="min-w-0 truncate font-text text-name">{props.node.task.name}</span>
          </button>
        </h3>
        <Show when={verdict()}>
          {(current) => <span class={`shrink-0 font-mono text-label ${tone()}`}>{say(t, current())}</span>}
        </Show>
        <span class="relative flex h-5 w-6 shrink-0 items-center justify-center">
          <button
            type="button"
            aria-label={t('sidebar.openTask', { name: props.node.task.name })}
            title={t('sidebar.openTask', { name: props.node.task.name })}
            onClick={() => navigate('/tasks')}
            class="absolute inset-0 grid place-items-center rounded-md font-mono text-label text-faint transition-colors duration-normal hover:bg-surface-2 hover:text-foreground"
          >
            {props.node.runs.length}
          </button>
        </span>
      </div>

      <Show when={open()}>
        <ul class={`space-y-0.5 ${RAIL_STEP}`}>
          <For each={shown()}>
            {(conversation) => (
              <ConversationRow conversation={conversation} label={formatAge(conversation.updatedAt, Date.now())} />
            )}
          </For>
        </ul>
        <div class={`flex items-center gap-2 ${RAIL_ROW} ${RAIL_STEP}`}>
          <Show when={hidden() > 0}>
            <button
              type="button"
              onClick={() => setAll(true)}
              aria-label={t('sidebar.showAll', { count: props.node.runs.length })}
              class={`py-1 ${TEXT_ACTION}`}
            >
              {t('sidebar.more', { count: hidden() })}
            </button>
          </Show>
          <Show when={props.node.runs.length === 0}>
            <span class="py-1 font-text text-name text-faint">{t('tasks.noRuns')}</span>
          </Show>
          <button
            type="button"
            disabled={active()}
            onClick={() => void runNow()}
            aria-label={
              active()
                ? `${props.node.task.name}: ${t('tasks.runRunning')}`
                : t('sidebar.runNow', { name: props.node.task.name })
            }
            class={`min-w-16 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${TEXT_ACTION}`}
          >
            {t(active() ? 'tasks.runRunning' : 'tasks.runNow')}
          </button>
        </div>
      </Show>
    </div>
  )
}

/** The words for a verdict, with the count when it carries one. */
function say(t: ReturnType<typeof useText>, verdict: RunVerdict): string {
  return verdict.count === undefined ? t(verdict.key) : t(verdict.key, { count: verdict.count })
}
