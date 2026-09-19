import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from '../components/icons.tsx'
import { TasksPage } from '../components/tasks/TasksPage.tsx'
import { useText } from '../stores/shell.ts'

/**
 * Tasks are a place of their own: a page lists every task whatever folder it runs in, which is
 * where the feature is found and where the first one is made (ticket #85).
 */
function TasksRoute() {
  const t = useText()
  return (
    <main className="h-full overflow-y-auto">
      <div className="px-8 pt-5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-control px-2 py-1 text-xs text-parchment-dim transition-colors hover:bg-ink-600 hover:text-parchment"
        >
          <ArrowLeftIcon />
          {t('settings.back')}
        </Link>
      </div>
      <TasksPage />
    </main>
  )
}

export const Route = createFileRoute('/tasks')({
  component: TasksRoute,
})
