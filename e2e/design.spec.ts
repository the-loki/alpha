import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Locator, type Page, test } from '@playwright/test'
import { APP_DIR, configureProvider } from './agent'
import { closeScriptedProviders, startScriptedProvider } from './scripted-provider'

/**
 * The window seam (C4.2), measured rather than eyeballed: the Caliper language is a 16rem rail
 * beside a page with an embedded view head, the radius scale on every body, two voices, and one
 * content edge that never moves (docs/constraints/05-design.md). These are the numbers a
 * redesign is allowed to change deliberately and not by accident, and they are asserted through
 * the window because that is where a person sees them.
 */
const SCRIPT = [{ tool: { name: 'bash', args: { command: 'echo hello' } } }, 'It says hello from the ledger.']

test.afterEach(() => closeScriptedProviders())

async function launch(options: { level?: string; replies?: unknown[]; noFolder?: boolean; slow?: boolean } = {}) {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(join(workspace, 'notes.txt'), 'hello from the ledger')
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      // A workbench that has never been given a folder: the title page a person sees first.
      workspace:
        options.noFolder === true
          ? { selection: { kind: 'none' }, recents: [] }
          : {
              selection: {
                kind: 'selected',
                workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() },
              },
              recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
            },
      language: 'en',
      permissionLevel: options.level ?? 'full-access',
    }),
    'utf-8',
  )
  const scripted = await startScriptedProvider({
    script: JSON.stringify(options.replies ?? SCRIPT),
    ...(options.slow === true ? { tokenSize: 4, tokensPerSecond: 20 } : {}),
  })
  configureProvider(dataDirectory, { baseUrl: scripted.url })
  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
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
  await expect(window.getByRole('main').locator('[data-role="user"]').filter({ hasText: text }).last()).toBeVisible({
    timeout: 30_000,
  })
}

const settled = (window: Page) => expect(window.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 30_000 })

/** The box a person clicks, in window coordinates. */
async function box(target: Locator): Promise<{ x: number; y: number; w: number; h: number }> {
  const rect = await target.boundingBox()
  if (rect === null) throw new Error('the control is not on the page')
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
}

async function heights(...controls: Locator[]): Promise<number[]> {
  return Promise.all(controls.map(async (control) => (await box(control)).h))
}

/** The computed style of one property on one element. */
async function style(target: Locator, property: string): Promise<string> {
  return target.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
}

/** A palette token is a hex value; a computed colour is `rgb(...)`. One spelling for both. */
function rgbOf(hex: string): string {
  const value = hex.trim().replace('#', '')
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

test('the controls in one row are one height', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // 2rem at the default root: the one height everything with a body is given (C5.4).
  const CONTROL = 32

  // The composer's foot: the way in to the picker, the two chips, and the control that sends.
  await expect(
    heights(
      window.getByRole('button', { name: 'Attach a picture' }),
      window.getByRole('button', { name: 'Full access' }),
      window.getByRole('button', { name: 'Scripted model' }),
      window.getByRole('button', { name: 'Send' }),
    ),
  ).resolves.toEqual([CONTROL, CONTROL, CONTROL, CONTROL])

  // The rail's places and the window's own three: one row of peers, one height.
  await expect(
    heights(
      window.getByRole('button', { name: 'New conversation' }),
      window.getByRole('button', { name: 'Search' }),
      window.getByRole('button', { name: 'Tasks' }),
      window.getByRole('link', { name: 'Settings' }),
      window.getByRole('button', { name: 'Minimize window' }),
      window.getByRole('button', { name: 'Close window' }),
    ),
  ).resolves.toEqual(Array.from({ length: 6 }, () => CONTROL))

  // And the head rule's own select, which stands in a row with words rather than with buttons.
  await expect(heights(window.getByRole('combobox', { name: 'Thinking' }))).resolves.toEqual([CONTROL])

  await app.close()
})

test('the decisions on an approval card are one height', async () => {
  const { app, window } = await launch({ level: 'ask' })
  await ask(window, 'change the file')
  await expect(window.getByRole('button', { name: 'Allow once' })).toBeVisible({ timeout: 30_000 })

  // "Always allow" is one body with the scope it is remembered for, so its body is the group's own
  // box rather than the button inside it: what a person sees in the row is four things, not five.
  const decisions = await heights(
    window.getByRole('button', { name: 'Allow once' }),
    window.getByRole('button', { name: 'Always allow' }).locator('..'),
    window.getByRole('textbox', { name: 'Reason for denying' }),
    window.getByRole('button', { name: 'Deny' }),
  )
  expect(new Set(decisions)).toEqual(new Set([32]))

  // The scope select is the inner box of the group — the group's height less the hairline at
  // either end (C5.4).
  const group = await box(window.getByRole('button', { name: 'Always allow' }).locator('..'))
  const scope = await box(window.getByRole('combobox', { name: 'Remember this for' }))
  expect(scope.h).toBe(group.h - 2)

  await app.close()
})

test('a page keeps its content on one edge, and the edge never moves', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // The reader's demand, made a rule (C5.3, C5.4): the page fills the pane the rail leaves it,
  // everything stands on the page's own edges, and nothing moves when the window is made wider.
  // Measured at two widths: a title that stands on one x at 1440 must stand on that same x at 2400.
  const offset = async (target: Locator) => (await box(target)).x - (await box(window.getByRole('main'))).x
  const measure = async () => ({
    title: await offset(window.getByRole('main').getByRole('heading', { level: 1 })),
    answer: await offset(window.getByRole('main').locator('[data-role="assistant"] > div').first()),
    composer: await offset(window.locator('[data-column="composer"]')),
  })

  const narrow = await measure()
  await window.setViewportSize({ width: 2400, height: 900 })
  const wide = await measure()

  expect(narrow.answer).toBe(narrow.title)
  expect(narrow.composer).toBe(narrow.title)
  expect(wide).toEqual(narrow)

  // What ends on the right: the reader's slip and the writing box share the page's right edge.
  const right = async (target: Locator) => {
    const rect = await box(target)
    return rect.x + rect.w
  }
  const slip = window.getByRole('main').locator('[data-role="user"] > div').last()
  expect(await right(slip)).toBe(await right(window.locator('[data-column="composer"]')))

  await app.close()
})

test('the answer fills the page, and a sentence of the interface keeps a measure', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)
  await window.setViewportSize({ width: 2400, height: 900 })

  // The answer's own prose fills the room the reader asked the window for; only a sentence the
  // interface itself writes is capped at the reading measure (C5.3).
  const answer = await box(window.getByRole('main').locator('[data-role="assistant"]').first())
  expect(answer.w).toBeGreaterThan(1200)
  await app.close()

  // The interface's capped sentence: the folder-less page's one explanation, at the measure while
  // the page under it fills the room.
  const bare = await launch({ noFolder: true })
  await bare.window.setViewportSize({ width: 2400, height: 900 })
  const sentence = bare.window.getByText('A folder is what the agent reads and edits')
  await expect(sentence).toBeVisible()
  expect((await box(bare.window.getByRole('main'))).w).toBeGreaterThan(2000)
  expect((await box(sentence)).w).toBeLessThan(800)
  await bare.app.close()
})

test('a new conversation greets you: the box in the middle, ways to start under it', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)
  await window.getByRole('button', { name: 'New conversation' }).click()

  // The greeting is the page's one line in the text voice — the hour decides which — the writing
  // box stands in the middle of the room rather than at its foot, and what can be started sits
  // under it (C5.4).
  const greeting = window.getByRole('heading', { level: 1 })
  await expect(greeting).toContainText(/Good (morning|afternoon|evening)/)
  const composer = await box(window.getByRole('textbox', { name: 'Message the agent' }))
  const viewport = window.viewportSize()
  if (viewport === null) throw new Error('no viewport')
  expect(composer.y).toBeGreaterThan(viewport.height * 0.2)
  expect(composer.y).toBeLessThan(viewport.height * 0.65)
  await expect(
    window.getByRole('button', { name: /Fix the last error|Review what changed|Write tests|Explain this folder/ }),
  ).toHaveCount(4)

  await app.close()
})

test('every control with a body wears the radius scale', async () => {
  const { app, window } = await launch({ level: 'ask' })
  await ask(window, 'change the file')
  await expect(window.getByRole('button', { name: 'Allow once' })).toBeVisible({ timeout: 30_000 })

  // One scale — 0.25/0.375/0.5/0.75rem, which is 4/6/8/12 at the default root — and no fifth
  // radius, no rounded-full, no square corner left on a body (C5.4, ADR-0027).
  const scale = new Set(['4px', '6px', '8px', '12px'])
  const boxes = window.locator('button:visible, input:visible, select:visible, textarea:visible, pre:visible')
  const count = await boxes.count()
  expect(count).toBeGreaterThan(10)
  for (let index = 0; index < count; index += 1) {
    const radius = await boxes.nth(index).evaluate((element) => {
      const value = getComputedStyle(element).borderRadius
      return value.endsWith('rem') ? `${parseFloat(value) * 16}px` : value
    })
    expect(scale.has(radius), `control ${index} wears radius ${radius}`).toBe(true)
  }

  await app.close()
})

test('a name is set in the text voice and a label in the apparatus — two voices, and no third', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // The text voice (C5.3): the title of the page and the answer itself — Geist Sans, and no serif.
  const title = window.getByRole('main').getByRole('heading', { level: 1 })
  expect(await style(title, 'font-family')).toContain('Geist Sans')
  const answer = window.getByRole('main').locator('[data-role="assistant"]').first()
  expect(await style(answer, 'font-family')).toContain('Geist Sans')

  // The apparatus voice: the index's headings, the chips, the shortcuts.
  const heading = window.getByRole('complementary').getByRole('heading', { name: 'Folders' })
  expect(await style(heading, 'font-family')).toContain('Geist Mono')
  const chip = window.getByRole('button', { name: 'Full access' })
  expect(await style(chip, 'font-family')).toContain('Geist Mono')

  await app.close()
})

test('the thinking knob sits at the model chip’s right hand, at the foot of the composer', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // The effort is a decision about the model's room, so it is chosen where the model is (C5.4).
  const thinking = window.getByLabel('Thinking effort')
  const model = window.getByRole('button', { name: 'Scripted model' })
  const knob = await thinking.boundingBox()
  const chip = await model.boundingBox()
  if (knob === null || chip === null) throw new Error('both chips are on screen')
  expect(Math.abs(knob.y - chip.y)).toBeLessThan(8)
  expect(knob.x).toBeGreaterThan(chip.x)

  await app.close()
})

test("the window's own controls sit in the top-right corner, on every page", async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  const corner = async () => {
    const close = await box(window.getByRole('button', { name: 'Close window' }))
    const viewport = window.viewportSize()
    if (viewport === null) throw new Error('no viewport')
    expect(close.x + close.w).toBeGreaterThanOrEqual(viewport.width - 48)
    expect(close.y).toBeLessThan(56)
    return { x: close.x + close.w, y: close.y }
  }

  // The conversation, the tasks list, a settings panel, and the title page with no view head —
  // all four land the three in the same corner (C5.4): the corner is the window's, not the
  // page's, so a page that grows a row above its view head does not drag the three down with it.
  const seen = [await corner()]
  await window.getByRole('button', { name: 'Tasks' }).click()
  seen.push(await corner())
  await window.getByRole('link', { name: 'Settings' }).click()
  seen.push(await corner())
  // Settings is a place: the way back is in its own menu, and the index comes back with it.
  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await window.getByRole('button', { name: 'New conversation' }).click()
  seen.push(await corner())
  expect(new Set(seen.map((at) => `${at.x}×${at.y}`)).size).toBe(1)

  await app.close()
})

test('the index and the settings menu are the same panel', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  const rail = await box(window.getByRole('complementary'))
  await window.getByRole('link', { name: 'Settings' }).click()
  const menu = await box(window.getByRole('navigation', { name: 'Settings sections' }))

  // One column, one slot: settings swaps the index rather than nesting a menu inside the page
  // (C5.4), so the two screens never disagree about where the left column ends.
  expect(menu.x).toBe(rail.x)
  expect(menu.w).toBe(rail.w)

  await app.close()
})

test('the row you are in carries the accent tick, and no row wears a dot leader', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  const current = window.getByRole('complementary').getByRole('button', { name: /^say something/ })
  await expect(current).toHaveAttribute('aria-current', 'true')

  // The tick at its left edge is the accent — the one saturated ink marking "here" (C5.5) — and
  // nothing joins a row's name to its measure: the measure a plain row carries is its age, in
  // the apparatus voice at the row's end, and the dot leader retired with the contents page
  // (ADR-0027).
  const tick = current.locator('span').first()
  const accent = rgbOf(await style(window.locator('html'), '--color-accent'))
  expect(await style(tick, 'background-color')).toBe(accent)
  await expect(current.locator('span.border-dotted')).toHaveCount(0)
  await expect(current.locator('span.font-mono').first()).toHaveText(/^(just now|\d+[mhd] ago)$/)

  // Front matter has no measure at all: the places carry no leaders, and a name keeps the width
  // a leader would have eaten rather than being clipped for it (C5.5).
  const place = window.getByRole('complementary').getByRole('button', { name: 'New conversation' })
  await expect(place.locator('span.border-dotted')).toHaveCount(0)
  expect(
    await place.locator('span.font-text').evaluate((element) => element.scrollWidth > element.clientWidth),
    'the place name is clipped',
  ).toBe(false)

  await app.close()
})

test('hovering a control moves nothing, and none is silent', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // A panel's own content arrives over IPC — the providers it found, the network it is on — and
  // that arrival re-lays out the page. Sweeping before it lands measures the panel that has not
  // written anything yet and calls its layout a hover move; wait for the shape to hold still.
  const settle = async (scope: Locator) => {
    let prior = ''
    for (let round = 0; round < 20; round += 1) {
      const shape = await scope.evaluate((element) => `${element.scrollHeight}:${element.querySelectorAll('*').length}`)
      if (shape === prior) return
      prior = shape
      await scope.evaluate(() => new Promise((resolve) => setTimeout(() => resolve(undefined), 150)))
    }
  }

  // The pointer's answer is colour — fill, frame, or ink — and never a change of box (C5.6). A
  // control that says nothing under the hand is a control a person cannot find. "Box" is measured
  // in layout coordinates: hovering scrolls a panel, and a scrolled window's coordinates say
  // "moved" about a control that never budged.
  const place = (control: Locator) =>
    control.evaluate((element) => {
      const node = element as HTMLElement
      return { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight }
    })
  const sweep = async (scope: Locator, where: string) => {
    await settle(scope)
    // A control already in force is not asked — it is saying "you are here", which is its answer
    // (C5.6) — nor is one that is disabled or that already says it opens.
    const controls = scope.locator(
      'button:visible:not([disabled]):not([aria-expanded]):not([aria-current]), a[href]:visible:not([aria-current])',
    )
    const count = await controls.count()
    expect(count, `${where} has no controls to look at`).toBeGreaterThan(2)
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index)
      const before = {
        box: await place(control),
        fill: await style(control, 'background-color'),
        ink: await style(control, 'color'),
        frame: await style(control, 'border-color'),
        line: await style(control, 'text-decoration-line'),
      }
      await control.hover()
      // The pointer's answer is a colour transition (C5.6), so the style is read after it lands —
      // reading at t=0 reads the colour the control is leaving.
      await control.evaluate((_element) => new Promise((resolve) => setTimeout(() => resolve(undefined), 200)))
      const after = {
        fill: await style(control, 'background-color'),
        ink: await style(control, 'color'),
        frame: await style(control, 'border-color'),
        line: await style(control, 'text-decoration-line'),
      }
      expect(await place(control), `${where} control ${index} moved`).toEqual(before.box)
      const answered =
        after.fill !== before.fill ||
        after.ink !== before.ink ||
        after.frame !== before.frame ||
        after.line !== before.line
      expect(
        answered,
        `${where} control ${index} is silent under the pointer: ${await control.evaluate((element) => element.outerHTML.slice(0, 160))}`,
      ).toBe(true)
    }
  }

  await sweep(window.getByRole('main'), 'the page')
  await sweep(window.getByRole('complementary'), 'the index')
  await window.getByRole('link', { name: 'Settings' }).click()
  await sweep(window.getByRole('main'), 'a settings panel')

  await app.close()
})

test('the caret marks what is streaming, and goes quiet when the turn ends', async () => {
  const { app, window } = await launch({
    replies: ['A long answer that arrives one small piece at a time so the caret can be seen.'],
    slow: true,
  })
  await ask(window, 'say something')
  // The accent's caret is the one live mark on the page while the answer is being written (C5.5).
  await expect(window.locator('.caret')).toBeVisible({ timeout: 30_000 })
  await settled(window)
  await expect(window.locator('.caret')).toHaveCount(0)
  await app.close()
})
