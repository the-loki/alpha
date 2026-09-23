import { useLocation } from '@solidjs/router'
import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from 'solid-js'
import { ConversationPalette, useShortcuts } from '../components/chrome/ConversationPalette.tsx'
import { Sidebar } from '../components/chrome/Sidebar.tsx'
import { SpineHead } from '../components/chrome/TitleBar.tsx'
import { UnlockScreen } from '../components/chrome/UnlockScreen.tsx'
import { bridge } from '../lib/bridge.ts'
import { PANEL, PANEL_WHOLE } from '../lib/ledger.ts'
import { conversationActions } from '../stores/conversations.ts'
import { folded, narrow } from '../stores/fold.ts'
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
  // way: that column is the settings menu itself, and settings has no rail to fold. A phone is where
  // both rules give way: there the two columns never share the page, so the column is the whole
  // screen when it is not folded and the page has the whole width when it is (C5.4). Which of the
  // two a phone is showing at any moment is not decided here but in the column's own rows: a tap in
  // it is what leaves it (`foldActions.choose`), so a row that chooses the page it was already on —
  // New conversation, on the title page — still changes the screen.
  const showColumn = () => !folded() || (inSettings() && !narrow())
  // Hidden rather than unmounted: what is typed into the composer, or into a settings form, is that
  // route's own state, and asking for the rail must not throw it away.
  const showPage = () => !narrow() || folded()

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
          <div class={narrow() ? PANEL_WHOLE : PANEL}>
            <SpineHead />
            <Show when={inSettings()} fallback={<Sidebar onSearch={() => setPaletteOpen(true)} />}>
              <SettingsNav />
            </Show>
          </div>
        </Show>
        <main class={`flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-surface-0 ${showPage() ? '' : 'hidden'}`}>
          {props.children}
        </main>
      </div>
      <ConversationPalette open={paletteOpen()} onClose={() => setPaletteOpen(false)} />
    </Show>
  )
}
