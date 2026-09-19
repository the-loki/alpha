import { formatAge, newTaskRun, type RunVerdict, type TaskNode } from '@alpha/core'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useText } from '../stores/shell.ts'
import { useTasks } from '../stores/tasks.ts'
import { ConversationRow } from './ConversationRow.tsx'
import { ChevronDownIcon, ClockIcon } from './icons.tsx'

/** How many of a task's runs the rail shows; the task's own page holds the rest. */
const SHOWN_RUNS = 5

/**
 * One task, in the folder it runs in, with the conversations its runs made beneath it — the third
 * level of the rail (ticket #85). Folding it is what keeps a daily task from filling the sidebar
 * with a month of the same title, so the folded row has to say how the last run went: a task that
 * has been failing all week must not look like one that has been fine.
 */
export function TaskGroup({ node }: { node: TaskNode }) {
  const t = useText()
  const navigate = useNavigate()
  const runNow = useTasks((state) => state.runNow)
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  const verdict = newTaskRun(node.lastRun)
  const shown = all ? node.runs : node.runs.slice(0, SHOWN_RUNS)
  const hidden = node.runs.length - shown.length
  // The word at the end of the row, in the colour the transcript uses for the same fact.
  const tone =
    verdict?.key === 'tasks.runFailed'
      ? 'text-danger'
      : verdict?.count === undefined
        ? 'text-parchment-faint'
        : 'text-amber'

  return (
    <div className="mt-1">
      <div className="group flex items-center gap-1">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-label={t(open ? 'sidebar.collapseTasks' : 'sidebar.expandTasks', { folder: node.task.name })}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full min-w-0 items-center gap-1 rounded-control px-2 py-1.5 text-left text-ui transition-colors hover:bg-ink-600"
          >
            <ChevronDownIcon className={`text-parchment-faint transition-transform ${open ? '' : '-rotate-90'}`} />
            <span className="ml-1 flex min-w-0 items-center gap-2">
              <ClockIcon className="text-parchment-faint" />
              <span className="min-w-0 truncate text-parchment-dim">{node.task.name}</span>
            </span>
          </button>
        </h3>
        {verdict !== undefined && <span className={`shrink-0 font-mono text-micro ${tone}`}>{say(t, verdict)}</span>}
        <span className="relative flex h-5 w-6 shrink-0 items-center justify-center">
          <button
            type="button"
            aria-label={t('sidebar.openTask', { name: node.task.name })}
            title={t('sidebar.openTask', { name: node.task.name })}
            onClick={() => void navigate({ to: '/tasks' })}
            className="absolute inset-0 grid place-items-center rounded-control font-mono text-micro text-parchment-faint transition-colors hover:bg-ink-600 hover:text-parchment"
          >
            {node.runs.length}
          </button>
        </span>
      </div>

      {open && (
        <>
          <ul className="space-y-0.5">
            {shown.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                label={formatAge(conversation.updatedAt, Date.now())}
              />
            ))}
          </ul>
          <div className="flex items-center gap-2 pl-11">
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setAll(true)}
                aria-label={t('sidebar.showAll', { count: node.runs.length })}
                className="rounded-control py-1 font-mono text-micro text-parchment-faint transition-colors hover:text-parchment-dim"
              >
                {t('sidebar.more', { count: hidden })}
              </button>
            )}
            {node.runs.length === 0 && (
              <span className="py-1 text-micro text-parchment-faint">{t('tasks.noRuns')}</span>
            )}
            <button
              type="button"
              onClick={() => void runNow(node.task.id)}
              aria-label={t('sidebar.runNow', { name: node.task.name })}
              className="rounded-control py-1 text-micro text-parchment-faint transition-colors hover:text-parchment-dim"
            >
              {t('tasks.runNow')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** The words for a verdict, with the count when it carries one. */
function say(t: ReturnType<typeof useText>, verdict: RunVerdict): string {
  return verdict.count === undefined ? t(verdict.key) : t(verdict.key, { count: verdict.count })
}
