/**
 * The workbench window as a port. The channel table asks for a folder picker and the three chrome
 * commands; this is what answers when the client is an Electron window, and the only file that
 * knows a `BrowserWindow` stands behind them.
 */
import type { PickWorkspaceResult } from '@alpha/contract'
import { workspaceFromPath } from '@alpha/domain'
import { type BrowserWindow, dialog } from 'electron'
import type { WindowPort } from './channels.ts'

export function desktopWindowPort(window: () => BrowserWindow): WindowPort {
  return {
    pickFolder: async (): Promise<PickWorkspaceResult> => {
      const result = await dialog.showOpenDialog(window(), {
        title: 'Open a folder as a workspace',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, workspace: { kind: 'none' } }
      }
      // The choice is only *made* here; remembering it, and what the window is told afterwards, is
      // the channel's business, so the port hands back the folder and nothing else.
      return {
        canceled: false,
        workspace: { kind: 'selected', workspace: workspaceFromPath(result.filePaths[0], Date.now()) },
      }
    },
    minimize: () => window().minimize(),
    toggleMaximize: () => {
      const target = window()
      if (target.isMaximized()) target.unmaximize()
      else target.maximize()
    },
    close: () => window().close(),
  }
}
