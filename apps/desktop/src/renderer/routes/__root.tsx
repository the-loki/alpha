import { useLocation } from '@solidjs/router'
import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js'
import { ConversationPalette, useShortcuts } from '../components/ConversationPalette.tsx'
import { PANEL } from '../components/ledger.ts'
import { Sidebar } from '../components/Sidebar.tsx'
import { SpineHead } from '../components/TitleBar.tsx'
import { UnlockScreen } from '../components/UnlockScreen.tsx'
import { bridge } from '../lib/bridge.ts'
import { conversationActions } from '../stores/conversations.ts'
import { folded } from '../stores/fold.ts'
import { shell, shellActions } from '../stores/shell.ts'
import { taskActions } from '../stores/tasks.ts'
import { SettingsNav } from './settings.tsx'

export function RootLayout(props: { children?: JSX.Element }) {
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  useShortcuts({ onPalette: () => setPaletteOpen(true) })
  // Settings is a place, not a panel of the workbench: it takes the window, and the way back is in
  // its own menu rather than in the rail behind it.
  const location = useLocation()
  const inSettings = () => location.pathname.startsWith('/settings')
  // The rail folds completely — no icon strip, the page takes the whole width — and the state is
  // remembered (C5.4, `stores/fold.ts`). Settings is the one screen that keeps its column either
  // way: that column is the settings menu itself, and settings has no rail to fold.
  const showColumn = () => inSettings() || !folded()

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
      {/* The window is two columns: the rail holds everything that is the workbench rather than
          the work — identity, places, the folders and their conversations, the door to settings —
          and the page takes everything beside it. No gutter and no floating panels: a hairline
          divides the columns and that is all (C5.4). The rail folds away whole, and the page takes
          the room it leaves. The masthead is the column's first child, so its banner role is
          implicit. */}
      <div class="flex h-screen bg-surface-0">
        <Show when={showColumn()}>
          <div class={PANEL}>
            <SpineHead />
            <Show when={inSettings()} fallback={<Sidebar onSearch={() => setPaletteOpen(true)} />}>
              <SettingsNav />
            </Show>
          </div>
        </Show>
        <main class="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-0">{props.children}</main>
      </div>
      <ConversationPalette open={paletteOpen()} onClose={() => setPaletteOpen(false)} />
    </Show>
  )
}
