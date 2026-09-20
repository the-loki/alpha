/**
 * The single workbench window. It has no native frame: the app draws its own header, which is
 * what keeps the Ember Ink surface unbroken from the top edge down. The macOS traffic lights
 * stay, because replacing those on that platform is a worse experience than keeping them.
 */

import type { WindowState } from '@alpha/core'
import { BrowserWindow, shell } from 'electron'
import type { Broadcast } from './broadcast.ts'

const isMac = process.platform === 'darwin'

export function createMainWindow(options: {
  preloadPath: string
  rendererUrl: string
  rendererFile: string
  /** Where the window's own state goes; the window is one client among however many. */
  broadcast: Broadcast
}): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: '#14110E',
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      preload: options.preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  window.once('ready-to-show', () => window.show())

  // Anything that wants a new window — a link in a transcript, a tool printing a URL — opens
  // in the user's browser instead. The workbench never navigates itself away from the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const publish = () => options.broadcast.send('windowStateChanged', currentWindowState(window))
  window.on('maximize', publish)
  window.on('unmaximize', publish)
  window.on('enter-full-screen', publish)
  window.on('leave-full-screen', publish)

  if (options.rendererUrl === '') {
    void window.loadFile(options.rendererFile)
  } else {
    void window.loadURL(options.rendererUrl)
  }

  return window
}

function currentWindowState(window: BrowserWindow): WindowState {
  return { maximized: window.isMaximized(), fullScreen: window.isFullScreen() }
}
