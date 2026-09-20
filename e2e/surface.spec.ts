import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Locator, type Page, test } from '@playwright/test'
import { APP_DIR, configureProvider, scriptedAgent } from './agent'

/**
 * The window seam (C4.2): what a surface is drawn *on*, and what happens under the hand. Three
 * rules that are invisible in a screenshot of one palette and obvious in the other two:
 *
 * - an overlay stands a step off what it covers (C5.2's ladder), which the dark palette is where
 *   the step is three percent and a panel dissolves into the page behind it;
 * - the keyboard's ring is never removed, whatever a control's own class says (C5.7);
 * - hovering moves nothing — only colour and border change (C5.6).
 */
const SCRIPT = [{ tool: { name: 'read', args: { path: 'notes.txt' } } }, 'It says hello from the ledger.']

async function launch(options: { theme?: 'light' | 'dark' } = {}) {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(join(workspace, 'notes.txt'), 'hello from the ledger')
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      ...scriptedAgent,
      language: 'en',
      permissionLevel: 'full-access',
      theme: options.theme ?? 'light',
    }),
    'utf-8',
  )
  configureProvider(dataDirectory)
  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      ALPHA_FAUX_REPLIES: JSON.stringify(SCRIPT),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window }
}

async function ask(window: Page, text: string): Promise<void> {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
  // The words are an entry in the transcript, and the composer's own button is back: the first is what
  // makes it an ask, and the second is what makes the turn over. Waiting on the button alone is waiting
  // on a control that is visible before a turn starts.
  await expect(window.getByRole('main').locator('[data-role="user"]').filter({ hasText: text }).last()).toBeVisible({
    timeout: 30_000,
  })
  await expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 30_000 })
}

/**
 * How far the panel's own fill stands off what is under it, as a contrast ratio: 1.00 is a panel
 * that is not there. The scrim, where there is one, is composited over the surface it dims first,
 * because that is what the panel is drawn on — and the compositing is done by the browser, in a
 * canvas, because a `color-mix` is not reported in sRGB and reading its channels as bytes is how
 * a test ends up measuring the wrong colour.
 */
async function stepOff(
  window: Page,
  panel: Locator,
  backdrop: Locator,
  scrim?: Locator,
): Promise<{ ratio: number; panel: string; dimmed: string }> {
  const [panelHandle, backdropHandle, scrimHandle] = await Promise.all([
    panel.elementHandle(),
    backdrop.elementHandle(),
    scrim === undefined ? Promise.resolve(null) : scrim.elementHandle(),
  ])
  return await window.evaluate(
    ([panelNode, backdropNode, scrimNode]) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context === null) throw new Error('no 2d context')
      const fill = (node: Element): string => getComputedStyle(node).backgroundColor
      /** The colour that is actually on screen: each layer painted over the one below it. */
      const painted = (layers: string[]): number[] => {
        context.clearRect(0, 0, 1, 1)
        for (const layer of layers) {
          context.fillStyle = layer
          context.fillRect(0, 0, 1, 1)
        }
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
      }
      const luminance = (rgb: number[]): number => {
        const linear = rgb.map((channel) => {
          const part = channel / 255
          return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
      }

      const under = painted(scrimNode === null ? [fill(backdropNode)] : [fill(backdropNode), fill(scrimNode)])
      const surface = painted([fill(backdropNode)])
      const panelColour = painted([fill(panelNode)])
      const a = luminance(panelColour)
      const b = luminance(under)
      const show = (rgb: number[]): string => `rgb(${rgb.join(' ')})`
      return {
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        panel: `${show(panelColour)} ${fill(panelNode)} over ${show(surface)}`,
        dimmed: `${show(under)}`,
      }
    },
    [panelHandle, backdropHandle, scrimHandle] as const,
  )
}

/** How far the words inside a panel stand off its own fill, as a contrast ratio. */
async function textOn(panel: Locator): Promise<number> {
  return await panel.evaluate((node) => {
    const painted = (value: string): number[] => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (context === null) return [0, 0, 0]
      context.fillStyle = getComputedStyle(node as Element).backgroundColor
      context.fillRect(0, 0, 1, 1)
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = (rgb: number[]): number => {
      const linear = rgb.map((channel) => {
        const part = channel / 255
        return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
    }
    // The first word inside the panel: a row's own colour, over the panel's fill.
    const written = [...(node as Element).querySelectorAll('*')].find(
      (child) => getComputedStyle(child).backgroundColor === 'rgba(0, 0, 0, 0)',
    )
    const ink = getComputedStyle(written ?? (node as Element)).color
    const onPanel = painted('rgba(0,0,0,0)')
    const text = painted(ink)
    const a = luminance(text)
    const b = luminance(onPanel)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}

test('every overlay stands a step off what it covers, in both palettes', async () => {
  test.setTimeout(120_000)
  for (const theme of ['light', 'dark'] as const) {
    const { app, window } = await launch({ theme })
    await ask(window, 'say something')
    const page = window.getByRole('main')
    // A panel that is a percent off its backdrop is not a panel: the step has to be readable.
    const STEP = 1.1

    await window.keyboard.press('Control+k')
    const palette = window.getByRole('dialog', { name: 'Switch conversation' })
    await expect(palette).toBeVisible()
    const palettePanel = palette.locator('div').first()
    const paletteStep = await stepOff(window, palettePanel, page, palette)
    // And what is written on it: the panel is a mixed colour, so reading the token table's hex
    // values is no longer a reading of what those words sit on (C5.2, 4.5:1).
    const paletteText = await textOn(palettePanel)
    await window.keyboard.press('Escape')

    await window.getByRole('button', { name: 'Full access' }).click()
    const levelMenu = window.getByRole('menu', { name: 'Permission level' })
    await expect(levelMenu).toBeVisible()
    const levelStep = await stepOff(window, levelMenu, page)
    // The row that says which level is in force is a tint of the menu it sits in: a solid step of
    // the ladder came out the menu's own colour in the dark palette and read as no row at all.
    const currentRow = window.getByRole('menuitemradio', { name: /Plan|Ask|Accept edits|Full access/ }).first()
    const rowStep = await stepOff(window, currentRow, levelMenu)
    await window.keyboard.press('Escape')

    await window.getByRole('button', { name: 'Scripted model' }).click()
    const modelMenu = window.getByRole('menu').first()
    await expect(modelMenu).toBeVisible()
    const modelStep = await stepOff(window, modelMenu, page)
    await window.keyboard.press('Escape')

    // The one overlay that covers chrome rather than the page: it stands off the rail.
    const actions = window.getByRole('button', { name: /^Actions for / }).first()
    await actions.hover()
    await actions.click()
    await expect(window.getByRole('menuitem', { name: 'Archive' })).toBeVisible()
    const railMenu = window.locator('div.rounded-overlay').first()
    const railStep = await stepOff(window, railMenu, window.getByRole('complementary'))

    const steps = { palette: paletteStep, level: levelStep, model: modelStep, rail: railStep, row: rowStep }
    for (const [what, step] of Object.entries(steps)) {
      expect(
        step.ratio,
        `${theme} ${what}: ${step.panel} on ${step.dimmed} = ${step.ratio.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(STEP)
    }
    expect(paletteText, `${theme} palette words are ${paletteText.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)

    await app.close()
  }
})

test('the keyboard is never left without a ring', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()

  // A field, reached by the keyboard: a text box matches :focus-visible whenever it is focused.
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.focus()
  // A ring that is the colour of what it is drawn on is not a ring, so the accent is checked too.
  // Read after the transition has landed: a control with `transition-colors` fades its ring in from
  // the text colour, and reading it on the same frame as the focus is reading the fade's start.
  const ring = async (target: Locator) => {
    await window.waitForTimeout(250)
    return await target.evaluate((node) => {
      // The accent is read the same way the outline is: a probe element wearing it, so the two
      // strings come out of one pipeline rather than out of a stylesheet and a computed value.
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--color-accent)'
      document.body.append(probe)
      const accent = getComputedStyle(probe).backgroundColor
      probe.remove()
      const style = getComputedStyle(node as Element)
      return {
        width: Number.parseFloat(style.outlineWidth),
        style: style.outlineStyle,
        isAccent: style.outlineColor === accent,
      }
    })
  }
  const field = await ring(composer)
  expect({ width: field.width, style: field.style, isAccent: field.isAccent }).toEqual({
    width: 2,
    style: 'solid',
    isAccent: true,
  })

  // A button, reached by Tab rather than by a click: the ring is for the keyboard, and only for it.
  await window.keyboard.press('Tab')
  const focused = window.locator(':focus')
  const control = await ring(focused)
  expect({ width: control.width, style: control.style, isAccent: control.isAccent }).toEqual({
    width: 2,
    style: 'solid',
    isAccent: true,
  })

  // And a settings field, which is where the app used to take the ring away.
  await window.getByRole('link', { name: 'Settings' }).click()
  const provider = window.getByRole('textbox', { name: 'Id', exact: true })
  await provider.focus()
  const settingsField = await ring(provider)
  expect({ width: settingsField.width, style: settingsField.style, isAccent: settingsField.isAccent }).toEqual({
    width: 2,
    style: 'solid',
    isAccent: true,
  })

  // And inside an overlay, which is where a ring is easiest to lose to a clipping panel.
  await window.keyboard.press('Control+k')
  const search = window.getByRole('textbox', { name: 'Search conversations' })
  await expect(search).toBeVisible()
  await search.focus()
  const overlayField = await ring(search)
  expect({ width: overlayField.width, style: overlayField.style }).toEqual({ width: 2, style: 'solid' })

  await app.close()
})

test('hovering a control moves nothing', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()
  await ask(window, 'say something')

  const geometry = async (target: Locator) =>
    await target.evaluate((node) => {
      const style = getComputedStyle(node as Element)
      const rect = (node as Element).getBoundingClientRect()
      return {
        // Not rounded: a half-pixel of movement is movement, and rounding is how it would hide.
        box: [rect.x, rect.y, rect.width, rect.height].join(','),
        border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].join(
          '/',
        ),
        padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join('/'),
        transform: style.transform,
        filter: style.filter,
        opacity: style.opacity,
        margin: [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].join('/'),
      }
    })

  // Four kinds of thing a hand passes over: a chip, a rail row, a ledger row, an action.
  const touched: [string, Locator][] = [
    ['model chip', window.getByRole('button', { name: 'Scripted model' })],
    [
      'rail row',
      window
        .getByRole('complementary')
        .getByRole('button', { name: /say something/ })
        .first(),
    ],
    ['ledger row', window.getByRole('button', { name: /notes\.txt/ }).first()],
    ['copy action', window.getByRole('button', { name: 'Copy' }).first()],
  ]

  for (const [what, target] of touched) {
    const before = await geometry(target)
    await target.hover()
    await window.waitForTimeout(220)
    const after = await geometry(target)
    // A row's own actions fade in over the row: opacity is the one thing C5.6 lets a hover change,
    // and it is the only difference allowed here.
    const { opacity: _was, ...rest } = before
    const { opacity: _is, ...alsoRest } = after
    expect({ what, ...alsoRest }).toEqual({ what, ...rest })
  }

  await app.close()
})

/** What is actually on screen where an element is: its own fill painted over its ancestors'. */
async function painted(target: Locator): Promise<{ rgb: string; lum: number }> {
  return await target.evaluate((node) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) throw new Error('no 2d context')
    const chain: string[] = []
    for (let current: Element | null = node as Element; current !== null; current = current.parentElement) {
      chain.push(getComputedStyle(current).backgroundColor)
    }
    // Outermost first, so a translucent layer lands on the colour it is drawn on.
    for (const layer of chain.reverse()) {
      context.fillStyle = layer
      context.fillRect(0, 0, 1, 1)
    }
    const [r = 0, g = 0, b = 0] = [...context.getImageData(0, 0, 1, 1).data]
    const linear = [r, g, b].map((channel) => {
      const part = channel / 255
      return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
    })
    return {
      rgb: `${r} ${g} ${b}`,
      lum: 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0),
    }
  })
}

/** The colour of one of the theme's own slots: a probe wearing it, read by the same pipeline. */
async function token(window: Page, name: string): Promise<string> {
  await window.evaluate((slot) => {
    const probe = document.createElement('div')
    probe.dataset.probe = slot
    probe.style.backgroundColor = `var(--color-${slot})`
    document.body.append(probe)
  }, name)
  const seen = await painted(window.locator(`[data-probe="${name}"]`))
  await window.evaluate((slot) => document.querySelector(`[data-probe="${slot}"]`)?.remove(), name)
  return seen.rgb
}

/**
 * One pointer, one answer (C5.6). A control the hand can act on tells the hand the same thing
 * wherever it is drawn: it takes the panel's tint, `--ink-600` — the one step off the page in both
 * palettes, darker in the light and lighter in the dark. A translucent wash is not that: the same
 * wash over the rail and over the page is two different answers, and in the dark palette one of them
 * sinks back into the page instead of lifting off it. A fill that is the page's own colour is not an
 * answer either, and three of the settings panels used to give exactly that.
 */
test('the pointer is answered with one fill, on every surface', async () => {
  test.setTimeout(240_000)
  for (const theme of ['light', 'dark'] as const) {
    const { app, window } = await launch({ theme })
    await ask(window, 'say something')
    const tint = await token(window, 'ink-600')

    const answer = async (what: string, target: Locator) => {
      await target.hover()
      // Past the fade: a control that answers with `transition-colors` is mid-answer otherwise.
      await window.waitForTimeout(260)
      const seen = await painted(target)
      expect(`${theme} ${what} is ${seen.rgb}`, `${theme} ${what}: ${seen.rgb} where the tint is ${tint}`).toBe(
        `${theme} ${what} is ${tint}`,
      )
      const fade = await target.evaluate((node) => getComputedStyle(node as Element).transitionDuration)
      expect(`${theme} ${what} fades in ${fade}`).not.toBe(`${theme} ${what} fades in 0s`)
    }

    // The strip: a command beside the window's own controls. Both are one row of chrome, and the
    // three commands used to lift while the controls beside them darkened.
    await answer('the Tasks command', window.getByRole('button', { name: 'Tasks' }))
    await answer('a window control', window.getByRole('button', { name: 'Minimize window' }))

    // The rail: a folder row, a glyph on the index's own heading, and the places inside settings.
    const rail = window.getByRole('complementary')
    await answer('a folder row', rail.getByRole('button', { name: 'sandbox' }).first())
    await answer('a glyph action', rail.getByRole('button', { name: 'Add a folder' }))

    // The page: the ledger's rows.
    await answer('a ledger row', window.getByRole('button', { name: /notes\.txt/ }).first())

    // And the pages: a choice, a decision card, a button with a frame.
    await window.getByRole('link', { name: 'Settings' }).click()
    await window.getByRole('link', { name: 'Appearance', exact: true }).click()
    const appearanceChoice = window.getByRole('button', { name: theme === 'dark' ? 'Light' : 'Dark' })
    await answer('an appearance choice', appearanceChoice)

    await window.getByRole('link', { name: 'Permissions', exact: true }).click()
    const level = window.getByRole('main').getByRole('button', { name: /^Ask/ }).first()
    await answer('a permission card', level)

    await window.getByRole('link', { name: 'Agent', exact: true }).click()
    await answer(
      'a settings button',
      window
        .getByRole('main')
        .getByRole('button', { name: /Look again/ })
        .first(),
    )

    // The nav is the rail's panel in another place, and its rows answer like the rail's rows.
    await answer('a settings row', window.getByRole('link', { name: 'Providers', exact: true }))

    await app.close()
  }
})

/**
 * Two things the pointer can act on that are not rows, and the answer each of them owes. A chip is a
 * frame: the pointer brightens the frame, and the chip keeps its fill — the two chips in the
 * composer's foot used to disagree, one brightening and the other saying nothing at all. A word is
 * only a word: the pointer lifts its ink and fills nothing, so a row of actions under a message
 * never turns into a row of buttons.
 */
test('a chip answers with its frame, a word answers with its ink', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()
  await ask(window, 'say something')
  // The turn's own actions appear when the answer is complete: reading a control before that is
  // reading one the transcript may replace under the pointer, and a detached node has no styles.
  await expect(window.getByRole('button', { name: 'Copy message' }).first()).toBeVisible()

  const edgeAndInk = async (target: Locator) =>
    await target.evaluate((node) => {
      if (!(node as Element).isConnected) throw new Error('the control was replaced while it was being read')
      const style = getComputedStyle(node as Element)
      return { edge: style.borderTopColor, ink: style.color, fill: style.backgroundColor }
    })

  for (const what of ['Scripted model', 'Full access']) {
    const chip = window.getByRole('button', { name: what, exact: true })
    const before = await edgeAndInk(chip)
    await chip.hover()
    await window.waitForTimeout(260)
    const after = await edgeAndInk(chip)
    expect(`${what} edge: ${before.edge} -> ${after.edge}`).not.toBe(`${what} edge: ${before.edge} -> ${before.edge}`)
    expect(`${what} fill: ${before.fill} -> ${after.fill}`).toBe(`${what} fill: ${before.fill} -> ${before.fill}`)
  }

  const word = window.getByRole('button', { name: 'Copy message' }).first()
  const before = await edgeAndInk(word)
  await word.hover()
  await window.waitForTimeout(260)
  const after = await edgeAndInk(word)
  expect(`copy ink: ${before.ink} -> ${after.ink}`).not.toBe(`copy ink: ${before.ink} -> ${before.ink}`)
  expect(`copy fill stays ${before.fill}`).toBe(`copy fill stays ${after.fill}`)

  await app.close()
})

/**
 * The row inside a menu, and the menu it is inside. An overlay is a lift off the page (C5.2), so the
 * row inside it is a further step in the same direction — and it has to be that direction in both
 * palettes. The rows used to be a tint of the page's own ink, which meant the row a pointer was over
 * sank back toward the page it had just floated off: closer to the page than the menu around it.
 */
test('a row inside a menu steps further off the page than the menu does', async () => {
  test.setTimeout(240_000)
  for (const theme of ['light', 'dark'] as const) {
    const { app, window } = await launch({ theme })
    await ask(window, 'say something')
    const page = await painted(window.getByRole('main'))

    /** How far off the page a surface is drawn: a row closer to the page than its menu is a hole. */
    const step = async (target: Locator): Promise<number> => {
      const seen = await painted(target)
      return Math.abs(seen.lum - page.lum)
    }

    await window.getByRole('button', { name: 'Full access' }).click()
    const menu = window.getByRole('menu', { name: 'Permission level' })
    await expect(menu).toBeVisible()
    const surface = await step(menu)
    // The row in force, and a row the pointer is over: both are steps off the menu's own fill.
    const inForce = await step(menu.locator('button[aria-checked="true"]').first())
    expect(inForce, `${theme}: the row in force inside a menu sinks toward the page`).toBeGreaterThan(surface)
    const other = menu.locator('button[role="menuitemradio"][aria-checked="false"]').first()
    await other.hover()
    await window.waitForTimeout(260)
    const hovered = await step(other)
    expect(hovered, `${theme}: hovering a menu row sinks it toward the page`).toBeGreaterThan(surface)
    await window.keyboard.press('Escape')

    // The palette's own row is the same promise, over a panel that floats on a scrim. Its rows take
    // the pointer by *becoming* the choice, so what is measured is where the pointer left it.
    await window.keyboard.press('Control+k')
    const dialog = window.getByRole('dialog', { name: 'Switch conversation' })
    await expect(dialog).toBeVisible()
    const palette = await step(dialog.locator('div').first())
    const chosen = await step(dialog.getByRole('option', { selected: true }))
    expect(chosen, `${theme}: the palette's row in force sinks toward the page`).toBeGreaterThan(palette)
    await window.keyboard.press('Escape')

    await app.close()
  }
})

/**
 * The wheel's grip. A scrollbar takes its room from the column it scrolls — 0.5rem of it — and draws
 * its thumb inside that room, a transparent border on each side being what makes the thumb a pill
 * rather than a bar. Three pixels of border on each side of an eight pixel bar leaves two pixels to
 * take hold of, which is a hairline with a hit area, not a grip.
 */
test('the wheel’s grip is a grip, and the wheel takes real room', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()
  await ask(window, 'say something')
  await ask(window, 'and something else')
  // A window too short for the transcript, so the wheel is really there to be measured.
  await window.setViewportSize({ width: 1440, height: 380 })

  const bar = await window.getByRole('main').evaluate((node) => {
    const scroller = [...node.querySelectorAll('*')].find(
      (child) => getComputedStyle(child).overflowY === 'auto' && child.scrollHeight > child.clientHeight,
    )
    if (scroller === undefined) throw new Error('nothing on this page scrolls')
    const box = scroller as HTMLElement
    const style = getComputedStyle(document.documentElement, '::-webkit-scrollbar')
    const thumb = getComputedStyle(document.documentElement, '::-webkit-scrollbar-thumb')
    const edge = Number.parseFloat(thumb.borderLeftWidth) + Number.parseFloat(thumb.borderRightWidth)
    return {
      room: box.offsetWidth - box.clientWidth,
      width: Number.parseFloat(style.width),
      grip: Number.parseFloat(style.width) - edge,
    }
  })
  expect({ room: bar.room, width: bar.width }).toEqual({ room: 8, width: 8 })
  expect(bar.grip, `a ${bar.grip}px grip inside a ${bar.width}px bar`).toBeGreaterThanOrEqual(4)

  await app.close()
})
