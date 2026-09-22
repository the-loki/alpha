import { createSignal } from 'solid-js'

/**
 * Whether the rail is folded away (C5.4). The rail folds completely — no icon strip, the page takes
 * the whole width — so this one bit decides the shape of every screen, and every screen reads it:
 * the root layout draws the column or does not, the view heads draw the toggle, the corner of a
 * headless page draws the way back in.
 *
 * It is remembered across launches: a choice about the window's own shape is made once, not every
 * time the window opens. The memory is localStorage — a client's own preference, kept by that
 * client — and a window with no storage still folds; it just forgets it did.
 */
const STORAGE_KEY = 'alpha:rail-folded'

function remembered(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function remember(value: boolean): void {
  try {
    if (value) globalThis.localStorage?.setItem(STORAGE_KEY, '1')
    else globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // Storage that refuses is not a failure to report: the fold still works for this session.
  }
}

const [folded, setFolded] = createSignal(remembered())

export { folded }

export const foldActions = {
  toggle: (): void => {
    setFolded((value) => {
      const next = !value
      remember(next)
      return next
    })
  },
}
