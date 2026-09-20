import { ArrowLeftIcon } from '../components/icons.tsx'
import { BESIDE_SCROLLS } from '../components/ledger.ts'
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
    <div class="flex h-full min-h-0 flex-col">
      {/* The way back is the one row above the band, at the page's own edge: the rail beside this
          page is the workbench's index rather than this page's menu, so the way back belongs to the
          page. Its own padding is cancelled, so its word stands on the x the page's title stands
          on rather than a hair to the right of it. */}
      <div class={`shrink-0 pt-2 ${BESIDE_SCROLLS}`}>
        <a
          href="#/"
          class="-ml-2 inline-flex items-center gap-2 rounded-control px-2 py-1 text-xs text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <ArrowLeftIcon />
          {t('settings.back')}
        </a>
      </div>
      <TasksPage />
    </div>
  )
}
