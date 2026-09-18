import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Sidebar } from '../components/Sidebar.tsx'
import { TitleBar } from '../components/TitleBar.tsx'
import { useShell } from '../stores/shell.ts'

function RootLayout() {
  const load = useShell((state) => state.load)
  const setWindowMaximized = useShell((state) => state.setWindowMaximized)

  useEffect(() => {
    void load()
    return window.alpha?.onWindowState((state) => setWindowMaximized(state.maximized))
  }, [load, setWindowMaximized])

  return (
    <div className="flex h-screen flex-col bg-ink-900">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
