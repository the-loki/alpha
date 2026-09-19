import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { ConversationPalette, useShortcuts } from '../components/ConversationPalette.tsx'
import { Sidebar } from '../components/Sidebar.tsx'
import { TitleBar } from '../components/TitleBar.tsx'
import { UnlockScreen } from '../components/UnlockScreen.tsx'
import { bridge } from '../lib/bridge.ts'
import { useConversations } from '../stores/conversations.ts'
import { useShell } from '../stores/shell.ts'

function RootLayout() {
  const load = useShell((state) => state.load)
  const ready = useShell((state) => state.ready)
  const locked = useShell((state) => state.locked)
  const setWindowMaximized = useShell((state) => state.setWindowMaximized)
  const loadList = useConversations((state) => state.loadList)
  const applyEvent = useConversations((state) => state.applyEvent)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const openPalette = useCallback(() => setPaletteOpen(true), [])
  useShortcuts({ onPalette: openPalette })

  useEffect(() => {
    // The contract, whichever transport is behind it: a browser reaches the same events.
    const client = bridge()
    void load()
    const stopWindowState = client.onWindowState((state) => setWindowMaximized(state.maximized))
    const stopRuntimeEvents = client.onRuntimeEvent((event) => applyEvent(event))
    return () => {
      stopWindowState()
      stopRuntimeEvents()
    }
  }, [load, applyEvent, setWindowMaximized])

  // The list belongs to a session, not to a mount: a browser that was refused at mount has none
  // yet, and asking while locked would only be refused again.
  useEffect(() => {
    if (ready && !locked) void loadList()
  }, [ready, locked, loadList])

  if (locked) return <UnlockScreen />

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
