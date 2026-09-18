import { createFileRoute } from '@tanstack/react-router'
import { Composer } from '../components/Composer.tsx'
import { EmptyState } from '../components/EmptyState.tsx'

function Workbench() {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <EmptyState />
      </div>
      <Composer />
    </div>
  )
}

export const Route = createFileRoute('/')({ component: Workbench })
