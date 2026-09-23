/**
 * The single workbench window. It has no native frame: the workbench draws its own view head, which is
 * what keeps the Iris surface unbroken from the top edge down. The macOS traffic lights
 * stay, because replacing those on that platform is a worse experience than keeping them.
 */

import type { WindowState } from '@alpha/contract'
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
  // 1200 rather than 1440: the page fills what is left beside the rail, so the opening width *is*
  // the reading column. At 1200 it lands at about 830px of words — the band every chat client
  // settles in (C5.3) — and a wider default would only buy longer lines.
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    // The window is painted before any state file has been read, so its first colour is the
    // default palette's own: the porcelain window behind the panels (C5.2), not a guess at what
    // was saved — a flash of the wrong room is what an unpainted frame looks like.
    backgroundColor: '#eceef3',
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
  // in the user's browser instead: the window never leaves the workbench to follow one.
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
