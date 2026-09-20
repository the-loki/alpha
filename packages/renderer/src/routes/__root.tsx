import { useLocation } from '@solidjs/router'
import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js'
import { ConversationPalette, useShortcuts } from '../components/ConversationPalette.tsx'
import { Sidebar } from '../components/Sidebar.tsx'
import { TitleBar } from '../components/TitleBar.tsx'
import { UnlockScreen } from '../components/UnlockScreen.tsx'
import { bridge } from '../lib/bridge.ts'
import { conversationActions } from '../stores/conversations.ts'
import { shell, shellActions } from '../stores/shell.ts'
import { taskActions } from '../stores/tasks.ts'

export function RootLayout(props: { children?: JSX.Element }) {
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  useShortcuts({ onPalette: () => setPaletteOpen(true) })
  // Settings is a place, not a panel of the workbench: it takes the window, and the way back is
  // in its own menu rather than in the conversation list behind it.
  const location = useLocation()
  const inSettings = () => location.pathname.startsWith('/settings')

  onMount(() => {
    // The contract, whichever transport is behind it: a browser reaches the same events.
    const client = bridge()
    void shellActions.load()
    const stopWindowState = client.onWindowState((state) => shellActions.setWindowMaximized(state.maximized))
    const stopRuntimeEvents = client.onRuntimeEvent((event) => conversationActions.applyEvent(event))
    // Tasks arrive the same way: main pushes the whole list when a task is edited, runs, or ends.
    const stopTasks = client.onTasks((snapshot) => taskActions.apply(snapshot))
    onCleanup(() => {
      stopWindowState()
      stopRuntimeEvents()
      stopTasks()
    })
  })

  // The list belongs to a session, not to a mount: a browser that was refused at mount has none
  // yet, and asking while locked would only be refused again.
  createEffect(() => {
    if (!shell.ready || shell.locked) return
    void conversationActions.loadList()
    void bridge()
      .listTasks()
      .then((snapshot) => taskActions.apply(snapshot))
  })

  return (
    <Show when={!shell.locked} fallback={<UnlockScreen />}>
      {/* The window is a page and a rail, both floating: a soft gutter all the way round, one
          rounded surface for the workbench's contents and one for the page being worked in (C5.4). */}
      <div class="flex h-screen flex-col bg-ink-900">
        <TitleBar onSearch={() => setPaletteOpen(true)} inSettings={inSettings()} />
        <div class="flex min-h-0 flex-1 gap-2 px-2 pb-2">
          <Show when={!inSettings()}>
            <Sidebar />
          </Show>
          <main class="min-w-0 flex-1">
            <div class="flex h-full flex-col overflow-hidden rounded-card border border-line bg-ink-700 shadow-card">
              {props.children}
            </div>
          </main>
        </div>
        <ConversationPalette open={paletteOpen()} onClose={() => setPaletteOpen(false)} />
      </div>
    </Show>
  )
}
