import { ArrowLeftIcon } from '../components/icons.tsx'
import { PAGE } from '../components/ledger.ts'
import { TasksPage } from '../components/tasks/TasksPage.tsx'
import { useText } from '../stores/shell.ts'

/**
 * Tasks are a place of their own: a page lists every task whatever folder it runs in, which is
 * where the feature is found and where the first one is made (ticket #85).
 */
export function TasksRoute() {
  const t = useText()
  return (
    // A div, not a second `<main>`: the window has one main landmark, and this is it — the tasks
    // page is inside it, not beside it.
    <div class="h-full overflow-y-auto">
      {/* The way back sits at the page's own edge, the way it does in settings: above the column
          of content, not inside it. */}
      <div class={`pt-2 ${PAGE}`}>
        <a
          href="#/"
          class="inline-flex items-center gap-2 px-2 py-1 text-xs text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <ArrowLeftIcon />
          {t('settings.back')}
        </a>
      </div>
      <TasksPage />
    </div>
  )
}
