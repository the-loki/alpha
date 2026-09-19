import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, safeStorage } from 'electron'
import { Broadcast } from './broadcast.ts'
import { type ChannelPorts, headlessWindowPort } from './channels.ts'
import { desktopWindowPort } from './desktop-window.ts'
import { registerIpcHandlers, windowSubscriber } from './ipc.ts'
import { CredentialVault, type SecretCipher } from './providers/credential-vault.ts'
import { ProviderService } from './providers/service.ts'
import { ProviderStore } from './providers/store.ts'
import { RuntimeManager } from './runtime/manager.ts'
import { NetworkService } from './server/service.ts'
import { StateStore } from './state-store.ts'
import { TaskService } from './tasks/service.ts'
import { TaskStore } from './tasks/store.ts'
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

app.whenReady().then(async () => {
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

  // The clock the workbench keeps: tasks live in their own file, and one timer watches for them.
  const tasks = new TaskService({
    tasks: new TaskStore(dataDirectory),
    create: async (workspacePath) => (await runtime.create(workspacePath)).conversation.id,
    rename: (conversationId, title) => void runtime.rename(conversationId, title),
    setLevel: (conversationId, level) => void runtime.setConversationLevel(conversationId, level),
    prompt: (conversationId, text) => runtime.prompt(conversationId, text),
    runUnattended: (conversationId, text) => runtime.runUnattended(conversationId, text),
    workspaceExists: (path) => existsSync(path),
    changed: () => broadcast.send('tasksChanged', tasks.snapshot()),
    now: () => new Date(),
  })
  tasks.start()

  const providerService = new ProviderService(providers)
  const service = new NetworkService({
    store,
    broadcast,
    bundleDirectory: join(import.meta.dirname, '../renderer'),
    ports: () => serverPorts,
  })

  // Two clients, two windows on the same workbench: the desktop window may open a native folder
  // dialog and move itself, and a browser may do neither. Everything else is one set of handlers.
  const shared = { store, runtime, providers: providerService, network: service, tasks }
  const serverPorts: ChannelPorts = { ...shared, window: headlessWindowPort }
  const desktopPorts: ChannelPorts = {
    ...shared,
    window: desktopWindowPort(() => BrowserWindow.getAllWindows()[0]),
  }

  registerIpcHandlers(desktopPorts)
  await service.apply()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow({ ...windowPaths, broadcast })
  })

  app.on('before-quit', () => {
    tasks.stop()
    void runtime.closeAll()
  })

  return window
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
