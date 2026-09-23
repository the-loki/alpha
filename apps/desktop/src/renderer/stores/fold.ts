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
 *
 * A phone is the one screen where it is not a choice, so it is not remembered there: a phone shows
 * one column at a time (C5.4), and it opens on the page — the rail is the whole screen when the
 * toggle asks for it, and it is away again as soon as something is chosen from it.
 */
const STORAGE_KEY = 'alpha:rail-folded'

/**
 * The width under which the page is a phone's. A phone is 22–27rem wide, and the rail's 16rem plus
 * the page's own floor stop fitting beside each other well before 30rem: that is where one column at
 * a time becomes the only way both can be read (C5.4).
 */
const PHONE = '(max-width: 30rem)'

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

const query = globalThis.matchMedia?.(PHONE)
const [narrow, setNarrow] = createSignal(query?.matches === true)
const [folded, setFolded] = createSignal(narrow() ? true : remembered())

/** Folded or not — and remembered only where the fold is someone's choice. */
function fold(next: boolean): void {
  setFolded(() => {
    if (!narrow()) remember(next)
    return next
  })
}

query?.addEventListener('change', (event) => {
  setNarrow(event.matches)
  // A page that becomes a phone opens on the page; one that stops being a phone keeps the shape its
  // storage remembers.
  setFolded(event.matches ? true : remembered())
})

export { folded, narrow }

export const foldActions = {
  toggle: (): void => fold(!folded()),
  /** Folded away, and only where folded means "away": a wide page keeps its column whatever is
   * chosen from it, so this is the phone's own move. */
  foldAway: (): void => {
    if (narrow()) fold(true)
  },
  /** The handler a control that chooses a page wraps its own action in: on a phone a tap in the
   * column is a screen changing, so choosing leaves it (C5.4). */
  choose: (action: () => void) => (): void => {
    if (narrow()) fold(true)
    action()
  },
}
