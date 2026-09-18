import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { registerIpcHandlers, runtimeEventSender } from './ipc.ts'
import { RuntimeManager } from './runtime/manager.ts'
import { resolveModelRuntime } from './runtime/models.ts'
import { StateStore } from './state-store.ts'
import { createMainWindow } from './window.ts'

const windowPaths = {
  preloadPath: join(import.meta.dirname, '../preload/index.cjs'),
  rendererUrl: process.env.ELECTRON_RENDERER_URL ?? '',
  rendererFile: join(import.meta.dirname, '../renderer/index.html'),
}

app.setName('Alpha')

app.whenReady().then(() => {
  const dataDirectory = process.env.ALPHA_DATA_DIR ?? app.getPath('userData')
  const store = new StateStore(dataDirectory)
  const window = createMainWindow(windowPaths)
  const runtime = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    modelRuntime: () => resolveModelRuntime(process.env),
    emit: runtimeEventSender(() => BrowserWindow.getAllWindows()[0]),
  })

  registerIpcHandlers({ store, runtime, getWindow: () => BrowserWindow.getAllWindows()[0] })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(windowPaths)
  })

  app.on('before-quit', () => {
    void runtime.closeAll()
  })

  return window
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
