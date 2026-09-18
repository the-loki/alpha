/**
 * The Electron transport. Every channel in the contract is registered from the table in
 * `channels.ts` — this file knows how a handler is reached from the window, not what any handler
 * does — and it owns the three pushes the window's own surfaces follow: runtime events, the
 * remembered rules, and the window's state.
 *
 * The renderer is our own code, but it is also the process that could be compromised, so every
 * handler treats its arguments as arriving from outside.
 */
import { IPC } from '@alpha/core'
import { type BrowserWindow, ipcMain } from 'electron'
import type { Subscriber } from './broadcast.ts'
import { CHANNELS, type ChannelPorts } from './channels.ts'
import type { ProviderService } from './providers/service.ts'
import type { RuntimeManager } from './runtime/manager.ts'
import type { StateStore } from './state-store.ts'

export interface IpcContext {
  store: StateStore
  runtime: RuntimeManager
  providers: ProviderService
  getWindow: () => BrowserWindow
  /** What answers the folder picker and the chrome commands for this client. */
  window: ChannelPorts['window']
}

export function registerIpcHandlers(context: IpcContext): void {
  const ports: ChannelPorts = {
    store: context.store,
    runtime: context.runtime,
    providers: context.providers,
    window: context.window,
  }

  for (const [name, handler] of Object.entries(CHANNELS)) {
    ipcMain.handle(IPC[name as keyof typeof IPC], async (_event, ...args: unknown[]) => handler(ports, args))
  }
}

/**
 * The window as a subscriber to the broadcast: every push channel, forwarded under the contract's
 * own name for it. One function rather than one per channel, so a channel added to the contract is
 * delivered by the same road as the rest.
 */
export function windowSubscriber(getWindow: () => BrowserWindow): Subscriber {
  return ({ channel, payload }) => {
    const window = getWindow()
    if (window === undefined || window.isDestroyed()) return
    window.webContents.send(IPC[channel], payload)
  }
}
