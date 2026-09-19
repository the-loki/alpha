import type { AlphaBridge } from '@alpha/core'
import { isBrowserClient, networkBridge } from './network-bridge.ts'

declare global {
  interface Window {
    alpha: AlphaBridge
  }
}

/** Which process the workbench is being drawn in, for the surfaces that differ between them. */
export type ClientHost = 'desktop' | 'browser'

/**
 * The renderer's only door out. Two adapters implement the same contract: the preload does it over
 * Electron's IPC, and a browser does it over HTTP and one event stream. A window with neither — a
 * test harness, a mis-built bundle — is reported here rather than turning into a stack of
 * undefined-property errors three components deep.
 */
export function bridge(): AlphaBridge {
  const exposed = window.alpha
  if (exposed) return exposed
  if (isBrowserClient()) return networkBridge()
  throw new Error('The preload bridge is missing: this window was not opened by the main process.')
}

export function clientHost(): ClientHost {
  return window.alpha ? 'desktop' : 'browser'
}
