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
