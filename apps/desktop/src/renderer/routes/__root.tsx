import { useLocation } from '@solidjs/router'
import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js'
import { ConversationPalette, useShortcuts } from '../components/ConversationPalette.tsx'
import { Sidebar } from '../components/Sidebar.tsx'
import { SpineHead } from '../components/TitleBar.tsx'
import { UnlockScreen } from '../components/UnlockScreen.tsx'
import { bridge } from '../lib/bridge.ts'
import { conversationActions } from '../stores/conversations.ts'
import { shell, shellActions } from '../stores/shell.ts'
import { taskActions } from '../stores/tasks.ts'
import { SettingsNav } from './settings.tsx'

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
      {/* The window is a spine and a page, both floating in one gutter: the spine is everything
          that is the workbench rather than the work — identity, places, the index, the door to
          settings — and the page takes everything beside it, at the full height of the window.
          There is no strip above them: a second row of chrome across the top spent height the
          page reads on, and its commands live just as well in the spine (C5.4). The head of the
          spine is the panel's first child, so its banner role is implicit and its hairline runs
          the full width of the panel; the rail and the settings menu are the two contents the
          panel holds, one at a time. */}
      <div class="flex h-screen gap-2 bg-ink-900 p-2">
        <div class="flex w-64 shrink-0 flex-col rounded-card bg-ink-800">
          <SpineHead />
          <Show when={inSettings()} fallback={<Sidebar onSearch={() => setPaletteOpen(true)} />}>
            <SettingsNav />
          </Show>
        </div>
        <main class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-ink-700 shadow-card">
          {props.children}
        </main>
      </div>
      <ConversationPalette open={paletteOpen()} onClose={() => setPaletteOpen(false)} />
    </Show>
  )
}
