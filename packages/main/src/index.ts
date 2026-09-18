import { join } from 'node:path'
import { app, BrowserWindow, safeStorage } from 'electron'
import { Broadcast } from './broadcast.ts'
import { desktopWindowPort } from './desktop-window.ts'
import { registerIpcHandlers, windowSubscriber } from './ipc.ts'
import { CredentialVault, type SecretCipher } from './providers/credential-vault.ts'
import { ProviderService } from './providers/service.ts'
import { ProviderStore } from './providers/store.ts'
import { RuntimeManager } from './runtime/manager.ts'
import { StateStore } from './state-store.ts'
import { createMainWindow } from './window.ts'

const windowPaths = {
  preloadPath: join(import.meta.dirname, '../preload/index.cjs'),
  rendererUrl: process.env.ELECTRON_RENDERER_URL ?? '',
  rendererFile: join(import.meta.dirname, '../renderer/index.html'),
}

/** The OS keychain when it is there, and honest plaintext when it is not (ADR-0003). */
function osCipher(): SecretCipher {
  const available = safeStorage.isEncryptionAvailable()
  return {
    available,
    encrypt: (plaintext) => safeStorage.encryptString(plaintext).toString('base64'),
    decrypt: (payload) => safeStorage.decryptString(Buffer.from(payload, 'base64')),
  }
}

app.setName('Alpha')

app.whenReady().then(() => {
  const dataDirectory = process.env.ALPHA_DATA_DIR ?? app.getPath('userData')
  const store = new StateStore(dataDirectory)
  const vault = new CredentialVault(dataDirectory, osCipher())
  const providers = new ProviderStore(dataDirectory, vault)
  // Every push goes through the broadcast: the window subscribes like any other client, which is
  // what lets a browser be one too.
  const broadcast = new Broadcast()
  const window = createMainWindow({ ...windowPaths, broadcast })
  broadcast.subscribe(windowSubscriber(() => BrowserWindow.getAllWindows()[0]))

  const runtime = new RuntimeManager({
    dataDirectory,
    sessionsRoot: join(dataDirectory, 'sessions'),
    providers,
    store,
    env: process.env,
    emit: (event) => broadcast.send('runtimeEvent', event),
    emitRules: (rules) => broadcast.send('permissionRulesChanged', rules),
  })

  registerIpcHandlers({
    store,
    runtime,
    providers: new ProviderService(providers),
    getWindow: () => BrowserWindow.getAllWindows()[0],
    window: desktopWindowPort(() => BrowserWindow.getAllWindows()[0]),
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow({ ...windowPaths, broadcast })
  })

  app.on('before-quit', () => {
    void runtime.closeAll()
  })

  return window
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
