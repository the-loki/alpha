import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers } from './ipc.ts'
import { StateStore } from './state-store.ts'
import { createMainWindow } from './window.ts'

const windowPaths = {
  preloadPath: join(import.meta.dirname, '../preload/index.cjs'),
  rendererUrl: process.env.ELECTRON_RENDERER_URL ?? '',
  rendererFile: join(import.meta.dirname, '../renderer/index.html'),
}

app.setName('Alpha')

app.whenReady().then(() => {
  const store = new StateStore(process.env.ALPHA_DATA_DIR ?? app.getPath('userData'))
  const window = createMainWindow(windowPaths)
  registerIpcHandlers(store, () => BrowserWindow.getAllWindows()[0])

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(windowPaths)
  })

  return window
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
