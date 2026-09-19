import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { ConversationPalette, useShortcuts } from '../components/ConversationPalette.tsx'
import { Sidebar } from '../components/Sidebar.tsx'
import { TitleBar } from '../components/TitleBar.tsx'
import { UnlockScreen } from '../components/UnlockScreen.tsx'
import { bridge } from '../lib/bridge.ts'
import { useConversations } from '../stores/conversations.ts'
import { useShell } from '../stores/shell.ts'
import { useTasks } from '../stores/tasks.ts'

function RootLayout() {
  const load = useShell((state) => state.load)
  const ready = useShell((state) => state.ready)
  const locked = useShell((state) => state.locked)
  const setWindowMaximized = useShell((state) => state.setWindowMaximized)
  const loadList = useConversations((state) => state.loadList)
  const loadTasks = useTasks((state) => state.apply)
  const applyEvent = useConversations((state) => state.applyEvent)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  useShortcuts({ onPalette: openPalette })
  // Settings is a place, not a panel of the workbench: it takes the window, and the way back is
  // in its own menu rather than in the conversation list behind it.
  const inSettings = useRouterState({ select: (state) => state.location.pathname.startsWith('/settings') })

  useEffect(() => {
    // The contract, whichever transport is behind it: a browser reaches the same events.
    const client = bridge()
    void load()
    const stopWindowState = client.onWindowState((state) => setWindowMaximized(state.maximized))
    const stopRuntimeEvents = client.onRuntimeEvent((event) => applyEvent(event))
    // Tasks arrive the same way: main pushes the whole list when a task is edited, runs, or ends.
    const stopTasks = client.onTasks((snapshot) => loadTasks(snapshot))
    return () => {
      stopWindowState()
      stopRuntimeEvents()
      stopTasks()
    }
  }, [load, applyEvent, loadTasks, setWindowMaximized])

  // The list belongs to a session, not to a mount: a browser that was refused at mount has none
  // yet, and asking while locked would only be refused again.
  useEffect(() => {
    if (!ready || locked) return
    void loadList()
    void bridge()
      .listTasks()
      .then((snapshot) => loadTasks(snapshot))
  }, [ready, locked, loadList, loadTasks])

  if (locked) return <UnlockScreen />

  return (
    // The window is a page and a rail, both floating: a soft gutter all the way round, one rounded
    // surface for the workbench's contents and one for the page being worked in (C5.4).
    <div className="flex h-screen flex-col bg-ink-900">
      <TitleBar />
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        {!inSettings && <Sidebar onSearch={openPalette} />}
        <main className="min-w-0 flex-1">
          <div className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-ink-700 shadow-card">
            <Outlet />
          </div>
        </main>
      </div>
      <ConversationPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
