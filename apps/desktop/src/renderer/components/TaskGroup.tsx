import { formatAge, newTaskRun, type RunVerdict, type TaskNode } from '@alpha/core'
import { useNavigate } from '@solidjs/router'
import { createSignal, For, Show } from 'solid-js'
import { useText } from '../stores/shell.ts'
import { taskActions } from '../stores/tasks.ts'
import { ConversationRow } from './ConversationRow.tsx'
import { ClockIcon } from './icons.tsx'

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
  const verdict = () => newTaskRun(props.node.lastRun)
  const shown = () => (all() ? props.node.runs : props.node.runs.slice(0, SHOWN_RUNS))
  const hidden = () => props.node.runs.length - shown().length
  // The word at the end of the row, in the colour the transcript uses for the same fact.
  const tone = () =>
    verdict()?.key === 'tasks.runFailed'
      ? 'text-danger'
      : verdict()?.count === undefined
        ? 'text-parchment-faint'
        : 'text-amber'

  return (
    <div class="mt-1">
      <div class="group flex items-center gap-1">
        <h3 class="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open()}
            aria-label={t(open() ? 'sidebar.collapseTasks' : 'sidebar.expandTasks', { folder: props.node.task.name })}
            onClick={() => setOpen((value) => !value)}
            class="flex w-full min-w-0 items-center gap-1 rounded-control px-2 py-1.5 text-left text-ui transition-colors hover:bg-ink-600"
          >
            {/* The column a folder leaves empty, left empty here too: folding is the row's own
                click, so a chevron to aim at would be a control the rail does not have. */}
            <span class="w-4 shrink-0" aria-hidden="true" />
            <span class="ml-1 flex min-w-0 items-center gap-2">
              <ClockIcon class="text-parchment-faint" />
              <span class="min-w-0 truncate text-parchment-dim">{props.node.task.name}</span>
            </span>
          </button>
        </h3>
        <Show when={verdict()}>
          {(current) => <span class={`shrink-0 font-mono text-micro ${tone()}`}>{say(t, current())}</span>}
        </Show>
        <span class="relative flex h-5 w-6 shrink-0 items-center justify-center">
          <button
            type="button"
            aria-label={t('sidebar.openTask', { name: props.node.task.name })}
            title={t('sidebar.openTask', { name: props.node.task.name })}
            onClick={() => navigate('/tasks')}
            class="absolute inset-0 grid place-items-center rounded-control font-mono text-micro text-parchment-faint transition-colors hover:bg-ink-600 hover:text-parchment"
          >
            {props.node.runs.length}
          </button>
        </span>
      </div>

      <Show when={open()}>
        <ul class="space-y-0.5">
          <For each={shown()}>
            {(conversation) => (
              <ConversationRow conversation={conversation} label={formatAge(conversation.updatedAt, Date.now())} />
            )}
          </For>
        </ul>
        <div class="flex items-center gap-2 pl-11">
          <Show when={hidden() > 0}>
            <button
              type="button"
              onClick={() => setAll(true)}
              aria-label={t('sidebar.showAll', { count: props.node.runs.length })}
              class="rounded-control py-1 font-mono text-micro text-parchment-faint transition-colors hover:text-parchment-dim"
            >
              {t('sidebar.more', { count: hidden() })}
            </button>
          </Show>
          <Show when={props.node.runs.length === 0}>
            <span class="py-1 text-micro text-parchment-faint">{t('tasks.noRuns')}</span>
          </Show>
          <button
            type="button"
            onClick={() => void taskActions.runNow(props.node.task.id)}
            aria-label={t('sidebar.runNow', { name: props.node.task.name })}
            class="rounded-control py-1 text-micro text-parchment-faint transition-colors hover:text-parchment-dim"
          >
            {t('tasks.runNow')}
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
