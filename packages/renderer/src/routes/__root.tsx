import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { ConversationPalette, useShortcuts } from '../components/ConversationPalette.tsx'
import { Sidebar } from '../components/Sidebar.tsx'
import { TitleBar } from '../components/TitleBar.tsx'
import { useConversations } from '../stores/conversations.ts'
import { useShell } from '../stores/shell.ts'

function RootLayout() {
  const load = useShell((state) => state.load)
  const setWindowMaximized = useShell((state) => state.setWindowMaximized)
  const loadList = useConversations((state) => state.loadList)
  const applyEvent = useConversations((state) => state.applyEvent)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  useShortcuts({ onPalette: openPalette })

  useEffect(() => {
    void load()
    void loadList()
    const stopWindowState = window.alpha?.onWindowState((state) => setWindowMaximized(state.maximized))
    const stopRuntimeEvents = window.alpha?.onRuntimeEvent((event) => applyEvent(event))
    return () => {
      stopWindowState?.()
      stopRuntimeEvents?.()
    }
  }, [load, loadList, applyEvent, setWindowMaximized])

  return (
    <div className="flex h-screen flex-col bg-ink-900">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <ConversationPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
