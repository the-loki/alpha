import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
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
  // Settings is a place, not a panel of the workbench: it takes the window, and the way back is
  // in its own menu rather than in the conversation list behind it.
  const inSettings = useRouterState({ select: (state) => state.location.pathname.startsWith('/settings') })

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
      {/* The content is a card floating on the page, which is what separates "where I am" from
          "what I am reading" without another border around the window. */}
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        {!inSettings && <Sidebar onSearch={openPalette} />}
        <main className="min-w-0 flex-1">
          <div className="flex h-full flex-col overflow-hidden rounded-overlay border border-line bg-ink-700">
            <Outlet />
          </div>
        </main>
      </div>
      <ConversationPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
