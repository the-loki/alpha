import type { AlphaBridge } from '@alpha/core'

declare global {
  interface Window {
    alpha: AlphaBridge
  }
}

/**
 * The renderer's only door out. Tests and the browser-only dev server have no preload, so an
 * absent bridge is reported here rather than turning into a stack of undefined-property errors
 * three components deep.
 */
export function bridge(): AlphaBridge {
  const value = window.alpha
  if (!value) throw new Error('The preload bridge is missing: this window was not opened by the main process.')
  return value
}
