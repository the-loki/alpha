/**
 * The Electron transport. Every channel in the contract is registered from the table in
 * `channels.ts` — this file knows how a handler is reached from the window, not what any handler
 * does — and it owns the three pushes the window's own surfaces follow: runtime events, the
 * remembered rules, and the window's state.
 *
 * The renderer is our own code, but it is also the process that could be compromised, so every
 * handler treats its arguments as arriving from outside.
 */
import { IPC, type PermissionRule, type RuntimeEvent, type WindowState } from '@alpha/core'
import { type BrowserWindow, ipcMain } from 'electron'
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

/** Pushes one runtime event to the window, if there is one listening. */
export function runtimeEventSender(getWindow: () => BrowserWindow): (event: RuntimeEvent) => void {
  return (event) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC.runtimeEvent, event)
  }
}

/** Pushes the remembered rules, so a settings page that is open sees them change. */
export function permissionRulesSender(getWindow: () => BrowserWindow): (rules: PermissionRule[]) => void {
  return (rules) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC.permissionRulesChanged, rules)
  }
}

/** The window's own state, which decides whether its maximize control shows a restore glyph. */
export function windowStateSender(getWindow: () => BrowserWindow): (state: WindowState) => void {
  return (state) => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC.windowStateChanged, state)
  }
}
