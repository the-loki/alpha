import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Locator, type Page, test } from '@playwright/test'
import { APP_DIR, configureProvider } from './agent'
import { closeScriptedProviders, startScriptedProvider } from './scripted-provider'

/**
 * The window seam (C4.2), measured rather than eyeballed: the app draws one content column, one height
 * for a control that has a body, and no square corners (C5.4). These are the numbers a redesign is
 * allowed to change deliberately and not by accident, and they are asserted through the window
 * because that is where a person sees them.
 */
const SCRIPT = [{ tool: { name: 'bash', args: { command: 'echo hello' } } }, 'It says hello from the ledger.']

/** The settings panels, in the order the menu lists them: a sweep that visits them says this once. */
const SETTINGS_TABS = ['Providers', 'Permissions', 'Appearance', 'Browser access'] as const

test.afterEach(() => closeScriptedProviders())

async function launch(options: { level?: string; replies?: unknown[]; noFolder?: boolean } = {}) {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(join(workspace, 'notes.txt'), 'hello from the ledger')
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      // A workbench that has never been given a folder: the window names itself, because there is no
      // page to name.
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
  const scripted = await startScriptedProvider({ script: JSON.stringify(options.replies ?? SCRIPT) })
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
  // The ask is only an ask once the words are an entry in the transcript. The composer's own button is
  // visible before the turn starts, so a test that measures the page on that signal measures the
  // moment the conversation is being made — when the band already names it and the page has no page.
  await expect(window.getByRole('main').locator('[data-role="user"]').filter({ hasText: text }).last()).toBeVisible({
    timeout: 30_000,
  })
}

const settled = (window: Page) => expect(window.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 30_000 })

/**
 * A panel's own content arrives over IPC — the agent it found, the network it is on — so a sweep over a
 * panel waits for its controls. Measuring the instant its tab was clicked is measuring a panel that has
 * not written anything yet, and a sweep over none of anything passes.
 */
async function waitForControls(scope: Locator, where: string): Promise<void> {
  await expect
    .poll(async () => await scope.locator('button:not([disabled]), a[href]').count(), {
      timeout: 5_000,
      message: `${where} has no controls to look at`,
    })
    .toBeGreaterThan(0)
}

/** The box a person clicks, in window coordinates. */
async function box(target: Locator): Promise<{ x: number; y: number; w: number; h: number }> {
  const rect = await target.boundingBox()
  if (rect === null) throw new Error('the control is not on the page')
  return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
}

async function heights(...controls: Locator[]): Promise<number[]> {
  return Promise.all(controls.map(async (control) => (await box(control)).h))
}

test('the controls in one row are one height', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // 1.75rem at the default root: the one height everything with a body is given (C5.4).
  const CONTROL = 28

  // The composer's foot: the way in to the picker, the two chips, and the control that sends.
  await expect(
    heights(
      window.getByRole('button', { name: 'Attach a picture' }),
      window.getByRole('button', { name: 'Full access' }),
      window.getByRole('button', { name: 'Scripted model' }),
      window.getByRole('button', { name: 'Send' }),
    ),
  ).resolves.toEqual([CONTROL, CONTROL, CONTROL, CONTROL])

  // The strip above the page: its commands and the window's own controls are one row.
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

  // And the head's own select, which stands in a row with words rather than with buttons.
  await expect(heights(window.getByRole('combobox', { name: 'Thinking' }))).resolves.toEqual([CONTROL])

  // A choice in a settings panel is the same pill as a choice in another panel: one height, because
  // two panels that draw the same decision at two heights are two designs (C5.4). Each is measured
  // while its own panel is the one on screen.
  await window.getByRole('link', { name: 'Settings' }).click()
  await window.getByRole('link', { name: 'Appearance', exact: true }).click()
  const themeChoice = await heights(window.getByRole('main').getByRole('button', { name: 'Dark', exact: true }))
  await window.getByRole('link', { name: 'Browser access', exact: true }).click()
  const reachChoice = await heights(window.getByRole('main').getByRole('button', { name: 'This machine only' }))
  const tokenButtons = await heights(
    window.getByRole('main').getByRole('button', { name: 'Copy', exact: true }),
    window.getByRole('main').getByRole('button', { name: 'Replace' }),
  )
  expect([...themeChoice, ...reachChoice, ...tokenButtons]).toEqual(Array.from({ length: 4 }, () => CONTROL))
  await window.getByRole('link', { name: 'Back to the workbench' }).click()

  // An action that is only its glyph is the same box wherever it is drawn: the spine's own heading,
  // the composer's foot and the head of the spine draw the same kind of control, and a 1.25rem glyph
  // beside a 1.75rem one is two designs. The spine's places are rows, not glyphs — a row that is a
  // place carries its name.
  const glyphs = await Promise.all(
    [
      window.getByRole('button', { name: 'Add a folder' }),
      window.getByRole('button', { name: 'Attach a picture' }),
    ].map(async (glyph) => {
      const rect = await box(glyph)
      return [rect.w, rect.h]
    }),
  )
  expect(glyphs).toEqual([
    [CONTROL, CONTROL],
    [CONTROL, CONTROL],
  ])

  await app.close()
})

test('the decisions on a gate card are one height', async () => {
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
  expect(new Set(decisions)).toEqual(new Set([28]))

  // The scope select is the inner box of the group, so it is the group's height less the hairline
  // at either end — a second height for the same control would be the row reading as two rows.
  const group = await box(window.getByRole('button', { name: 'Always allow' }).locator('..'))
  const scope = await box(window.getByRole('combobox', { name: 'Remember this for' }))
  expect(scope.h).toBe(group.h - 2)

  await app.close()
})

test('a form page keeps its content on the page\u2019s own edge', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // Every page in this app is written from its own left edge — the conversation included (its own
  // test measures the page's edges at 2400). These two pages are forms, and a form is written from
  // the page's own edge — the title and the body under it start on the same x, one padding in — so
  // a page that centred its content would leave the title where it is and move everything under it,
  // which is the mistake this pass was about.
  const offset = async (target: Locator) => (await box(target)).x - (await box(window.getByRole('main'))).x

  await window.getByRole('button', { name: 'Tasks' }).click()
  const tasksTitle = await offset(window.getByRole('main').getByRole('heading', { level: 1 }))
  const tasksBody = await offset(window.getByRole('main').getByText('A task runs its prompt'))

  await window.getByRole('button', { name: 'New conversation' }).click()
  await window.getByRole('link', { name: 'Settings' }).click()
  const settingsTitle = await offset(window.getByRole('main').getByRole('heading', { level: 1 }))
  const settingsBody = await offset(window.getByRole('main').getByRole('paragraph').first())

  expect(tasksBody).toBe(tasksTitle)
  expect(settingsBody).toBe(settingsTitle)
  expect(settingsTitle).toBe(tasksTitle)
  expect(settingsBody).toBe(tasksBody)

  await app.close()
})

test('a page\u2019s body starts the same distance under its band', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // The band's rule is the page's own head line: what the page holds starts under it by one
  // number on every page whose body begins below it — 1.5rem (C5.4) — or the two pages look like
  // they were assembled by two people.
  const BODY_OFFSET = 24
  const underTheBand = async (body: Locator): Promise<number> => {
    const [bandBox, bodyBox] = await Promise.all([box(window.getByRole('main').locator('header').first()), box(body)])
    return bodyBox.y - (bandBox.y + bandBox.h)
  }

  await window.getByRole('button', { name: 'Tasks' }).click()
  const tasksBody = await underTheBand(window.getByRole('main').getByText('A task runs its prompt'))

  await window.getByRole('button', { name: 'New conversation' }).click()
  await window.getByRole('link', { name: 'Settings' }).click()
  const settingsBody = await underTheBand(window.getByRole('main').getByRole('paragraph').first())

  expect({ tasksBody, settingsBody }).toEqual({ tasksBody: BODY_OFFSET, settingsBody: BODY_OFFSET })

  // The conversation is the exception the glass explains: its transcript slides *under* the head,
  // so what has to hold there is that no entry comes to rest beneath it.
  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await window
    .getByRole('complementary')
    .getByRole('button', { name: /say something/ })
    .first()
    .click()
  const [band, entry] = await Promise.all([
    box(window.getByRole('main').locator('div[class*="h-14"]').first()),
    box(window.getByRole('main').locator('[data-role="user"]').first()),
  ])
  expect(entry.y).toBeGreaterThanOrEqual(band.y + band.h)

  await app.close()
})

test('nothing escapes the column, however unbreakable the words are', async () => {
  const { app, window } = await launch({
    replies: [`the hash is ${'a'.repeat(400)} and https://example.com/${'b'.repeat(300)} ends it.`],
  })
  await window.setViewportSize({ width: 1024, height: 720 })
  await ask(window, `look at ${'c'.repeat(400)}`)
  await settled(window)

  // A word that cannot break is the one thing prose spacing cannot hold: `white-space` keeps the
  // line breaks and still lets one long token spill past the box that holds it. Nothing is allowed
  // out of the column — the scroll the transcript owns gains no width to the side, and no
  // sentence's own box carries words past its own edge.
  const spill = await window.getByRole('main').evaluate((node) => {
    const over = (element: Element) => element.scrollWidth - element.clientWidth
    const scroller = [...node.querySelectorAll('*')].find(
      (child) => getComputedStyle(child).overflowY === 'auto' && child.clientHeight > 0,
    )
    const words = [...node.querySelectorAll('[data-role="user"] p, [data-role="assistant"] p')].map(over)
    return {
      column: scroller === undefined ? 999 : over(scroller),
      words: Math.max(...words, 0),
    }
  })
  expect(spill).toEqual({ column: 0, words: 0 })

  await app.close()
})

test('a block that groups things is inset by one number', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // Every block that groups fields is inset 1rem on all four sides, and a group nested inside one
  // is inset half that: two blocks of the same kind four pixels apart is a panel that looks
  // assembled by two people, which is what the provider card and the form card were.
  const paddingOf = async (target: Locator): Promise<string> => {
    const [pad] = await target.evaluate((node) => {
      const style = getComputedStyle(node as Element)
      return [[style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(' ')]
    })
    return pad
      .split(' ')
      .map((value) => String(Math.round(Number.parseFloat(value))))
      .join('/')
  }
  const GROUP = '16/16/16/16'
  const NOTICE = '8/12/8/12'

  await window.getByRole('link', { name: 'Settings' }).click()
  await window.getByRole('link', { name: 'Providers', exact: true }).click()
  const page = window.getByRole('main')
  // Every block that groups a field, wherever it is: the panel's cards and the blocks nested in
  // them. Named blocks would let the next panel's card be a different inset without a word.
  const grouped = await window.evaluate(() => {
    const rounds = (value: string): number => Math.round(Number.parseFloat(value))
    // A block: edged on all four sides, filled, and holding a field — the panel's cards, and the
    // blocks nested in them (which take the control radius rather than the card's).
    const blocks = [...document.querySelectorAll('main *')].filter((node) => {
      const style = getComputedStyle(node)
      const edged = [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ].every((edge) => edge !== '0px')
      const filled = style.backgroundColor !== 'rgba(0, 0, 0, 0)'
      return edged && filled && node.querySelector('input, select, textarea') !== null
    })
    return blocks.map((node) => {
      const style = getComputedStyle(node)
      return {
        kind: `${node.tagName.toLowerCase()}.${node.className.toString().slice(0, 30)}`,
        pad: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(rounds).join('/'),
        radius: style.borderRadius,
        // A block inside another block that holds fields is the nested kind.
        nested: blocks.some((outer) => outer !== node && outer.contains(node)),
      }
    })
  })
  // The sweep has to have found what it is about: the panel's cards and at least one nested block.
  expect(grouped.length).toBeGreaterThanOrEqual(3)
  expect(grouped.filter((block) => block.nested).length).toBeGreaterThanOrEqual(1)
  for (const block of grouped) {
    expect(block.pad, `${block.kind} is ${block.pad}`).toBe(block.nested ? '8/8/8/8' : '16/16/16/16')
    // And the corner follows the same rule: a panel's block is a card, a block inside one is not.
    expect(block.radius, `${block.kind} is ${block.radius}`).toBe(block.nested ? '8px' : '12px')
  }

  // A notice, on the other hand, is a line and not a block: the same shape wherever it appears,
  // which is the control's radius rather than the card's.
  const notice = page.getByText('This system offers no keychain')
  expect(await paddingOf(notice)).toBe(NOTICE)
  expect(await notice.evaluate((node) => getComputedStyle(node).borderRadius)).toBe('8px')

  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.getByRole('button', { name: 'New task', exact: true }).click()
  const taskForm = window.getByRole('main').locator('section:has(button:text-is("Save task"))')
  expect(await paddingOf(taskForm)).toBe(GROUP)

  // And the field the person writes a prompt in is a field they write three lines in: three rows of
  // the body leading (1.5rem) plus its own padding, not the control height with the text inside it.
  const prompt = taskForm.locator('textarea')
  const single = taskForm.getByLabel('Name')
  const [tall, short] = await Promise.all([box(prompt), box(single)])
  expect({ tall: tall.h, overSingle: tall.h >= 3 * 24.75 + 16, short: short.h }).toEqual({
    tall: tall.h,
    overSingle: true,
    short: 28,
  })
  await app.close()
})

test('the composer\u2019s bar stands on the column the answers stand on', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // The bar is the page's own input card: its left edge is the x the answers start on, and it
  // does not drift for anything the transcript does around it.
  const [columnX, barX] = await window.getByRole('main').evaluate((node) => {
    const words = node.querySelector('[data-role="assistant"] p')
    const field = node.querySelector('textarea')
    let card: Element | null = field
    while (card !== null && !card.className.toString().includes('rounded-card')) card = card.parentElement
    if (card === null || field === null || words === null) throw new Error('the composer has no bar')
    return [Math.round(words.getBoundingClientRect().x), Math.round(card.getBoundingClientRect().x)]
  })
  expect(barX).toBe(columnX)

  await app.close()
})

/**
 * One column, whatever the window is. A conversation is written on one column and everything in it
 * stands on that column's edges — the prose, the code and tables inside it, the tool lines, the
 * reader's bubble and the bar the next message is written in. Without it the page is whatever the
 * window is: the prose caps out at its measure in the middle of a maximized window while code,
 * tables and the composer keep stretching to the panel's edges, which is a page that lost its
 * column rather than a wide one. Every one of these is measured at the same time, because a column
 * is a fact about all of them agreeing (C5.4, ADR-0024).
 */
test('the conversation is one column, however wide the window is', async () => {
  const { app, window } = await launch({
    replies: [
      { tool: { name: 'read', args: { path: 'notes.txt' } } },
      `A sentence of prose.\n\n| one | two | three |\n| --- | --- | --- |\n| a cell | another | third |\n\n\`\`\`ts\nconst line = 1\n\`\`\`\n`,
    ],
  })
  await window.setViewportSize({ width: 2400, height: 1200 })
  await ask(window, 'say something')
  await settled(window)

  const edges = await window.getByRole('main').evaluate((node) => {
    const r = (x: number) => Math.round(x)
    const box = (selector: string) => {
      const element = node.querySelector(selector)
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return { left: r(rect.left), right: r(rect.right), width: r(rect.width) }
    }
    return {
      column: box('[data-column="conversation"]'),
      title: box('[class*="h-14"] h1'),
      prose: box('[data-role="assistant"] p'),
      code: box('[data-role="assistant"] pre'),
      table: box('[data-role="assistant"] table'),
      tool: box('[data-role="tool"]'),
      bubble: box('[data-role="user"] > div'),
      composer:
        box('main textarea') === null
          ? null
          : (() => {
              let card: Element | null = node.querySelector('textarea')
              while (card !== null && !card.className.toString().includes('rounded-card')) card = card.parentElement
              if (card === null) return null
              const rect = card.getBoundingClientRect()
              return { left: r(rect.left), right: r(rect.right), width: r(rect.width) }
            })(),
    }
  })

  // The window is 2400 wide and the conversation uses it: everything the page holds is written on
  // the page's own pair of edges, and nothing is left standing on a second, narrower one. The page's
  // first line of prose starts exactly where the band's title does — one padding in — so no resize
  // can set the answer drifting away from the edge the title stands on.
  expect(edges.column).not.toBeNull()
  expect(edges.title).not.toBeNull()
  expect(edges.prose!.left - edges.column!.left, `the page is written one padding in: ${JSON.stringify(edges)}`).toBe(
    24,
  )
  expect(edges.title!.left, `the title and the body share the page's padding: ${JSON.stringify(edges.title)}`).toBe(
    edges.prose!.left,
  )

  // Everything that writes across the page shares both of its edges: the prose, the code and the
  // table inside an answer, a tool line, and the bar the next message is written in.
  const across = {
    prose: edges.prose,
    code: edges.code,
    table: edges.table,
    tool: edges.tool,
    composer: edges.composer,
  }
  for (const [what, part] of Object.entries(across)) {
    expect(part, `${what} is on the page`).not.toBeNull()
    expect({ what, left: part!.left, right: part!.right }).toEqual({
      what,
      left: edges.prose!.left,
      right: edges.prose!.right,
    })
  }

  // And the reader's own bubble is the one thing with a width of its own — capped near the measure,
  // so a short message stays a bubble — and it is set against the page's right edge, because what
  // the reader typed is a visitor in the column the answer owns.
  expect(edges.bubble).not.toBeNull()
  expect(edges.bubble!.right).toBe(edges.prose!.right)
  expect(edges.bubble!.width, `the bubble stays a bubble: ${JSON.stringify(edges.bubble)}`).toBeLessThanOrEqual(608)

  await app.close()
})

/**
 * The head of the page holds its title. The band is a row of one height with the title at its left
 * and the page's own controls at its right, and the quiet facts between them — the folder, when it
 * was last touched — are the first thing that may give way, because a band that keeps its controls
 * by squeezing the title to nothing has stopped saying what the page is.
 */
test('the band keeps its title, at every width', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  /** How much of the band the title keeps, and whether anything in the band runs past it. */
  const title = async () =>
    await window
      .getByRole('main')
      .getByRole('heading', { level: 1 })
      .evaluate((node) => {
        const rect = node.getBoundingClientRect()
        const band = node.closest('[class*="h-14"]')
        const controls = [...(band?.querySelectorAll('button, select, a[href]') ?? [])]
        const right = Math.max(-1, ...controls.map((control) => control.getBoundingClientRect().right))
        return {
          width: Math.round(rect.width),
          // Nothing in the band may be drawn past the band's own right edge, whatever the width.
          overhang: band === null ? -1 : Math.round(right - band.getBoundingClientRect().right),
        }
      })

  // Every width the window can actually be — the frameless window's own minimum is 1024 — including
  // the one where the band is most crowded, with the page's controls and the window's three in it.
  for (const width of [1440, 1200, 1024] as const) {
    await window.setViewportSize({ width, height: 760 })
    await window.waitForTimeout(200)
    const seen = await title()
    expect(seen.width, `the title at ${width}: ${JSON.stringify(seen)}`).toBeGreaterThan(60)
    expect(seen.overhang, `the band at ${width}: ${JSON.stringify(seen)}`).toBeLessThanOrEqual(0)
  }

  await app.close()
})

test('no control with a body is square', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  // A control is something a person presses or types into, or a card: the window's own surface, a
  // band it is clipped by, and a rule that is a line are none of those, and are not asked.
  const square = await window.evaluate(() => {
    const offenders: string[] = []
    const typable = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']
    for (const node of document.querySelectorAll('body *')) {
      const element = node as HTMLElement
      const rect = element.getBoundingClientRect()
      if (rect.width <= 2 || rect.height <= 2) continue
      const style = getComputedStyle(element)
      const edges = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
      const filled = style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none'
      if (!filled && edges.every((edge) => edge === '0px')) continue
      const edged = edges.every((edge) => edge !== '0px')
      if (!typable.includes(element.tagName) && !edged) continue
      const radii = [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ]
      if (radii.every((radius) => Number.parseFloat(radius) > 0)) continue
      offenders.push(
        `${element.tagName.toLowerCase()}.${element.className.toString().slice(0, 40)} "${(element.textContent ?? '').slice(0, 20)}"`,
      )
    }
    return offenders
  })
  expect(square).toEqual([])

  // The transcript's other state: the box a message is edited in is a control with a body too, and
  // a filled panel with square corners is exactly what the rule is about.
  await window.getByRole('button', { name: 'Edit' }).first().click()
  const editing = await window.evaluate(() => {
    const offenders: string[] = []
    for (const node of document.querySelectorAll('[class*="border-amber"] textarea, [class*="border-amber"]')) {
      const element = node as HTMLElement
      const style = getComputedStyle(element)
      const radii = [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ]
      if (radii.every((radius) => Number.parseFloat(radius) > 0)) continue
      offenders.push(`${element.tagName.toLowerCase()}.${element.className.toString().slice(0, 40)}`)
    }
    return offenders
  })
  expect(editing).toEqual([])

  await app.close()
})

/**
 * The window's own controls are the window's corner, and the corner is the top right. They live at
 * the right end of every page's band — after what acts on the page, past a hairline, because the
 * window is not one of the page's concerns — and they are in no band's head and on no screen twice.
 * A frameless window has to be closable from wherever its corner is, on every screen that has a
 * corner, including the one that has no band at all.
 */
test('the window\u2019s own controls sit in the top-right corner', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()
  // Before the first question the page is a folder's title page, and it wears no band either: the
  // corner is drawn there too, at the top of the pane, or a fresh workbench has no way to close.
  const titleClose = window.getByRole('main').getByRole('button', { name: 'Close window' })
  await expect(titleClose).toHaveCount(1)
  const titleBox = (await titleClose.boundingBox())!
  expect(titleBox.y, `the title page keeps the corner at the top: ${JSON.stringify(titleBox)}`).toBeLessThan(60)
  await ask(window, 'say something')
  await settled(window)

  const corner = async (
    where: string,
  ): Promise<{ where: string; trio: number; closeRight: number; headTrio: number }> => {
    const band = window.getByRole('main').locator('[class*="h-14"][class*="border-b"]').first()
    const head = window.getByRole('complementary').locator('header')
    const names = ['Minimize window', 'Maximize window', 'Restore window', 'Close window']
    const close = band.getByRole('button', { name: 'Close window' })
    const [trio, closeRight, headTrio] = await Promise.all([
      Promise.all(names.map((name) => band.getByRole('button', { name }).count())).then((counts) =>
        counts.reduce((a, b) => a + b, 0),
      ),
      close
        .count()
        .then(async (count) =>
          count === 0 ? -1 : Math.round((await close.boundingBox())!.x + (await close.boundingBox())!.width),
        ),
      Promise.all(names.map((name) => head.getByRole('button', { name }).count())).then((counts) =>
        counts.reduce((a, b) => a + b, 0),
      ),
    ])
    return { where, trio, closeRight, headTrio }
  }

  const found: ReturnType<typeof corner> extends Promise<infer T> ? T[] : never = []
  const visit = async (where: string, go: () => Promise<void>): Promise<void> => {
    await go()
    await window.waitForTimeout(300)
    found.push({ ...(await corner(where)), where })
  }
  await visit('the conversation', async () => {})
  await visit('the tasks page', () => window.getByRole('button', { name: 'Tasks' }).click())
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.getByRole('link', { name: 'Settings' }).click()
  await visit('a settings panel', async () => {})

  for (const one of found) {
    expect(one, `the window controls on ${one.where}`).toEqual({
      where: one.where,
      trio: 3,
      closeRight: expect.any(Number),
      headTrio: 0,
    })
    expect(one.closeRight, `close is the corner on ${one.where}`).toBeGreaterThan(0)
  }
  // The close button is the rightmost thing on every page: it is the corner.
  const rights = new Set(found.map((one) => one.closeRight))
  expect([...rights], `the corner is one x on every page: ${JSON.stringify(found)}`).toHaveLength(1)

  // And the screen that has no band still closes: its corner holds the trio too.
  const first = await launch({ noFolder: true })
  const alone = first.window.getByRole('main')
  await expect(alone.getByRole('button', { name: 'Close window' })).toHaveCount(1)
  await first.app.close()

  await app.close()
})

test('the rail and the settings menu are the same panel', async () => {
  const { app, window } = await launch()
  const rail = await box(window.getByRole('complementary'))
  // Where a row of the rail puts its name, and where a row of the menu puts its: the two screens are
  // the same window twice, so the index and the menu are read on one x, not on two.
  const rowName = async (row: Locator): Promise<number> =>
    Math.round(await row.evaluate((node) => (node.querySelector('span.min-w-0') as Element).getBoundingClientRect().x))
  const place = await rowName(window.getByRole('complementary').getByRole('button', { name: /^Search/ }))
  await window.getByRole('link', { name: 'Settings' }).click()
  const menu = await box(window.getByRole('navigation', { name: 'Settings sections' }))
  const tab = await rowName(
    window.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Providers', exact: true }),
  )
  expect(menu).toEqual(rail)
  expect(tab, "the menu reads on the rail's own x").toBe(place)
  await app.close()
})

/**
 * Where the page's chrome stops on the right. The wheel's room is reserved whether or not the wheel
 * is there (`SCROLLS`), so a page whose transcript is long ends on the same edge as a page whose
 * content fits — and the band above it, which never scrolls, gives up the same room on purpose
 * (`BESIDE_SCROLLS`), or it would end 8px past the body it names. One page, one right edge, and it
 * does not move when the page grows (C5.4).
 *
 * The page fills the pane, so that edge is one x for everything on it: the band's right end, the
 * entries and the composer's bar stop on the same x — the page's padding, with the wheel's room
 * outside the scroll on a form page and shared inside it on the conversation — and it is the same x
 * on the conversation, the tasks page and every settings panel.
 */
test('a page ends on one right edge, whether or not it has grown long', async () => {
  const { app, window } = await launch({
    replies: [{ tool: { name: 'read', args: { path: 'notes.txt' } } }, 'It says hello from the ledger.'],
  })
  await ask(window, 'show me the notes')
  await settled(window)
  await ask(window, 'and again')
  await settled(window)

  /**
   * Where the three things on a page stop: the entries, the band's content, the composer's card.
   * Rounded to the pixel: the band carries `backdrop-blur`, which puts its subtree on a composited
   * layer, and a layer can land a hundredth of a pixel off the row beside it. A hundredth of a
   * pixel is not a second right edge.
   */
  const edges = async (): Promise<{ entry: number; band: number; composer: number; scrolls: boolean }> =>
    await window.getByRole('main').evaluate((node) => {
      const round = (value: number) => Math.round(value)
      const of = (element: Element | null | undefined) =>
        element === null || element === undefined ? -1 : round(element.getBoundingClientRect().right)
      const band = node.querySelector('[class*="h-14"][class*="border-b"]')
      // The band's own right end: the control the page keeps at its right, whichever page it is.
      const bandRight = Math.max(
        -1,
        ...[...(band?.querySelectorAll('button, select, a[href]') ?? [])].map(
          (control) => control.getBoundingClientRect().right,
        ),
      )
      const scroller = [...node.querySelectorAll('*')].find(
        (child) => getComputedStyle(child).overflowY === 'auto' && child.clientHeight > 0,
      )
      let card: Element | null = node.querySelector('textarea')
      while (card !== null && !card.className.toString().includes('rounded-card')) card = card.parentElement
      return {
        entry: of(node.querySelector('[data-role="tool"]')),
        band: round(bandRight),
        composer: of(card),
        scrolls: scroller !== undefined && scroller.scrollHeight > scroller.clientHeight + 4,
      }
    })
  // The window a transcript fits in, and one it does not: the same page, one turn long and two.
  await window.setViewportSize({ width: 1440, height: 900 })
  const roomy = await edges()
  await window.setViewportSize({ width: 1440, height: 380 })
  const tight = await edges()

  // The two reads are only worth comparing if the wheel really came and went between them.
  expect({ roomy: roomy.scrolls, tight: tight.scrolls }).toEqual({ roomy: false, tight: true })
  // One page, one right edge, on both reads: the page fills the pane, so the band's right end, the
  // entries and the composer's bar all stop on the same x — wheel or no wheel.
  const { scrolls: _roomy, ...whileItFits } = roomy
  const { scrolls: _tight, ...onceItScrolls } = tight
  expect(whileItFits, `the page while it fits: ${JSON.stringify(roomy)}`).toEqual({
    entry: roomy.entry,
    band: roomy.entry,
    composer: roomy.entry,
  })
  expect(onceItScrolls, `the page once it scrolls: ${JSON.stringify(tight)}`).toEqual({
    entry: roomy.entry,
    band: roomy.entry,
    composer: roomy.entry,
  })

  // And the chrome's own edge is one x wherever you are: the band's right end is the same on the
  // conversation, on the tasks page and on a settings panel.
  const chromeRight = async (): Promise<number> =>
    await window.getByRole('main').evaluate((node) => {
      const band = node.querySelector('[class*="h-14"][class*="border-b"]')
      const controls = [...(band?.querySelectorAll('button, select, a[href]') ?? [])]
      const right =
        controls.length === 0
          ? (band?.lastElementChild?.getBoundingClientRect().right ?? -1)
          : Math.max(...controls.map((control) => control.getBoundingClientRect().right))
      return Math.round(right)
    })
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.waitForTimeout(300)
  const tasksBand = await chromeRight()
  await window.getByRole('link', { name: 'Settings' }).click()
  await window.waitForTimeout(300)
  const settingsBand = await chromeRight()
  expect({ tasksBand, settingsBand, conversationBand: roomy.band }).toEqual({
    tasksBand: roomy.band,
    settingsBand: roomy.band,
    conversationBand: roomy.band,
  })

  await app.close()
})

/**
 * A line of prose, measured in the unit that matters to a reader: characters. An answer's own prose
 * fills the pane — that is the room the reader asked the window for — and what still keeps the
 * reading measure is the interface's own voice: a panel's note, a hint, an empty state's line,
 * capped at seventy characters because they are labels and not content (C5.3, C5.4).
 */
test('a line of prose is a measure, not a wall', async () => {
  const paragraph =
    'A line of prose is read one line at a time, so its length is the one number a reader feels without naming ' +
    'it. When the line runs wider than a comfortable measure the eye loses its place on the return sweep, and ' +
    'the paragraph stops being a paragraph and becomes a wall of text with no shape in it for a reader to hold.'
  const { app, window } = await launch({ replies: [paragraph] })

  /**
   * How many characters the eye travels before it sweeps back, in the element's own voice: the widest
   * line the *text* makes, not the box it sits in — a block is as wide as its container whatever its
   * words do, so measuring the box measures the panel.
   */
  const perLine = async (target: Locator): Promise<{ chars: number; voice: string }> =>
    await target.evaluate((node) => {
      const element = node as Element
      const style = getComputedStyle(element)
      const probe = document.createElement('span')
      probe.style.cssText = `position:absolute;visibility:hidden;font:${style.font};white-space:pre;width:1ch`
      document.body.append(probe)
      const one = probe.getBoundingClientRect().width
      probe.remove()
      const range = document.createRange()
      range.selectNodeContents(element)
      const widest = Math.max(...[...range.getClientRects()].map((rect) => rect.width), 0)
      return { chars: Math.round(widest / one), voice: `${style.fontSize} ${style.fontFamily.split(',')[0]}` }
    })

  const READABLE = 70
  // The display voice is the empty state's own line; the body voice is the paragraph of an answer.
  const display = await perLine(window.getByRole('main').locator('p[class*="font-display"]').first())
  expect(display.chars, `the empty state: ${display.voice}`).toBeLessThanOrEqual(READABLE)

  await ask(window, 'show me the notes')
  await settled(window)
  // An answer's own prose is the page filling the pane — that is the room the reader asked the
  // window for. What still keeps a measure is the *interface's* prose, measured in the sweep below.
  const body = await perLine(window.getByRole('main').locator('p').filter({ hasText: 'comfortable measure' }).first())
  expect(body.chars, `an answer fills the pane: ${body.voice}`).toBeGreaterThanOrEqual(READABLE)

  // Every sentence the interface itself writes, on every panel that writes one: the line that
  // explains a section is prose too, and it keeps the measure the content no longer does.
  const long: string[] = []
  let measured = 0
  const proseOn = async (where: string): Promise<void> => {
    // The interface's prose is the sans voice *below* the body size — a note, a hint, an empty
    // state's sentence. What a path, a count or a diff does with its width is its own business, and
    // an answer's own paragraphs fill the page by design.
    for (const line of await window.getByRole('main').locator('p, span.block').all()) {
      const sans = await line.evaluate((node) => {
        const style = getComputedStyle(node as Element)
        return style.fontFamily.includes('Inter') && Number.parseFloat(style.fontSize) < 15
      })
      if (!sans) continue
      const { chars, voice } = await perLine(line)
      if (chars === 0) continue
      measured += 1
      if (chars > READABLE) {
        const words = await line.evaluate((node) => (node.textContent ?? '').trim().slice(0, 34))
        long.push(`${where}: ${chars}ch in ${voice}: "${words}"`)
      }
    }
  }
  await proseOn('the workbench')
  await window.getByRole('button', { name: 'Tasks' }).click()
  await proseOn('the tasks page')
  await window.getByRole('link', { name: 'Settings' }).click()
  for (const tab of SETTINGS_TABS) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    await waitForControls(window.getByRole('main'), tab)
    await proseOn(`settings: ${tab}`)
  }
  // The sweep has to have measured what it is about: six panels and the workbench write sentences.
  expect(measured, 'the sweep measured no prose at all').toBeGreaterThanOrEqual(12)
  expect(long, `these lines run past the measure:\n  ${long.join('\n  ')}`).toEqual([])

  await app.close()
})

/**
 * The app says what a thing is in the display voice, and what a part of it is in the label voice
 * (C5.4). The display voice is the serif a page's own name is set in — the conversation's title, the
 * tasks page's, every settings panel's, and the window's own name on the screen that has no page yet.
 * The label voice is the mono micro upper case that says `Folders`, `Gate`, `Models`: a part of one
 * thing, named. Three places disagreed with that: the settings panels named their sections in the sans
 * voice at 15px while the card beside them used the label voice, and the first screen a person ever
 * sees named the window in sans semibold.
 */
test('a thing is named in the display voice, and a part of it in the label voice', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()
  const voice = async (target: Locator): Promise<string> =>
    await target.evaluate((node) => {
      const style = getComputedStyle(node as Element)
      return [
        style.fontFamily.split(',')[0]?.replace(/["']/g, ''),
        style.fontSize,
        style.fontWeight,
        style.textTransform,
      ].join(' ')
    })

  // The band's title, on the conversation and on every page that wears a band.
  await ask(window, 'say something')
  await settled(window)
  const bandTitle = window.getByRole('main').locator('[class*="h-14"][class*="border-b"] h1')
  const titles: string[] = []
  const named = async (page: string): Promise<void> => {
    await expect(bandTitle).toHaveText(page)
    titles.push(await voice(bandTitle))
  }
  await named('say something')
  await window.getByRole('button', { name: 'Tasks' }).click()
  await named('Tasks')
  await window.getByRole('link', { name: 'Settings' }).click()
  for (const tab of SETTINGS_TABS) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    await named(tab)
  }
  expect(titles.length, `the pages name themselves in: ${titles.join(' / ')}`).toBe(6)
  expect(new Set(titles).size, `the page titles are ${JSON.stringify([...new Set(titles)])}`).toBe(1)
  expect(titles[0]).toContain('Inter')
  expect(titles[0]).toContain('20px')

  // And every part of one thing, wherever it is named, is named the same way.
  const parts: string[] = []
  const partsOn = async (): Promise<void> => {
    const found = await window.getByRole('main').evaluate((node) =>
      [...node.querySelectorAll('h2, h3')]
        .filter((heading) => (heading.textContent ?? '').trim().length > 0)
        .map((heading) => {
          const style = getComputedStyle(heading)
          return `${(heading.textContent ?? '').trim()} = ${[
            style.fontFamily.split(',')[0]?.replace(/["']/g, ''),
            style.fontSize,
            style.textTransform,
          ].join(' ')}`
        }),
    )
    parts.push(...found)
  }
  await window.getByRole('link', { name: 'Providers', exact: true }).click()
  await partsOn()
  await window.getByRole('link', { name: 'Permissions', exact: true }).click()
  await partsOn()
  await window.getByRole('link', { name: 'Appearance', exact: true }).click()
  await partsOn()
  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.getByRole('button', { name: 'New task', exact: true }).click()
  await window.getByRole('textbox').first().fill('Nightly check')
  await window.getByRole('textbox').nth(1).fill('Read the notes and report.')
  await window.getByRole('button', { name: 'Save task' }).click()
  // The card in the list opens the task, history and all — the rail's own row of the same name is the
  // index entry, not the thing that opens the form.
  await window.getByRole('main').getByRole('button', { name: 'Nightly check' }).first().click()
  await partsOn()
  // The sweep has to have found what it is about: the names of the parts of the five panels that have
  // them, and of the section a task's runs are listed under.
  expect(parts.map((part) => part.split(' = ')[0]).sort()).toEqual([
    'Accent',
    'Add a provider',
    'Default permission level',
    'Language',
    'Models',
    'Remembered approvals',
    'Runs',
    'Theme',
  ])
  const voices = new Set(parts.map((part) => part.split(' = ')[1]))
  expect([...voices], `the parts are named in ${voices.size} voices: ${parts.join(' / ')}`).toHaveLength(1)
  expect([...voices][0]).toContain('JetBrains Mono')
  expect([...voices][0]).toContain('11px')
  expect([...voices][0]).toContain('uppercase')

  await app.close()

  // The window with no page: it names itself in the display voice too, at the size the other screen
  // that stands on its own uses.
  const alone = await launch({ noFolder: true })
  const own = await voice(alone.window.getByRole('main').getByRole('heading', { level: 1 }))
  expect(own, `the first screen names itself: ${own}`).toBe('Inter 24px 600 none')
  await alone.app.close()
})

/**
 * The lit thing is one thing. The primary action is the accent carried as a light — the ember
 * gradient and its own glow (C5.4, ADR-0020) — and there were five of them: the app's own, three
 * hand-written buttons (2.25rem tall with a flat accent on the two that stand alone, a soft shadow and
 * a hover on a different colour), and the composer's send, which is a glyph on the control height and
 * wears the same light on its own body. The one screen that is not measured here is the unlock card a
 * *browser* is shown before it has a token: no window in this suite can reach it, and its button wears
 * `PRIMARY_ACTION` like the rest.
 */
test('the lit thing is one thing, on every screen that has one', async () => {
  test.setTimeout(120_000)
  /** What a primary action is made of: its box, its light, and what the pointer does to it. */
  const look = async (target: Locator): Promise<string> =>
    await target.evaluate((node) => {
      const element = node as Element
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return [
        `${Math.round(rect.height)}px`,
        style.backgroundImage === 'none' ? 'flat' : 'gradient',
        style.boxShadow === 'none' ? 'unlit' : 'glow',
        style.transitionDuration,
      ].join(' ')
    })

  const { app, window } = await launch()
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.getByRole('button', { name: 'New task', exact: true }).click()
  const appPrimary = await look(window.getByRole('button', { name: 'New task', exact: true }))
  expect(appPrimary, `the app's own primary: ${appPrimary}`).toBe('28px gradient glow 0.15s')
  // The composer's own control is lit the same way, and it is the one a person presses most often. A
  // disabled send is the ember gone quiet by design, so the light is measured with a message to send.
  await window.getByRole('button', { name: 'Cancel' }).click()
  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await window.getByRole('textbox', { name: 'Message the agent' }).fill('a message to send')
  expect(await look(window.getByRole('button', { name: 'Send', exact: true })), 'the composer says send').toBe(
    appPrimary,
  )
  await app.close()

  // The gate's decision, which is the primary of the card it stands on.
  const gate = await launch({ level: 'ask' })
  await ask(gate.window, 'change the file')
  const allow = gate.window.getByRole('button', { name: 'Allow once' })
  await expect(allow).toBeVisible({ timeout: 30_000 })
  expect(await look(allow), 'the gate says allow once').toBe(appPrimary)
  await gate.app.close()

  // And the first screen a person ever sees, whose one button is the way in.
  const alone = await launch({ noFolder: true })
  const choose = alone.window.getByRole('button', { name: 'Choose a folder', exact: true })
  expect(await look(choose), 'the first screen says choose a folder').toBe(appPrimary)
  await alone.app.close()
})

/**
 * The controls in a scope that answer the pointer with nothing, named for the failure message. The
 * ways a control can answer: fill, frame, ink, and the light a lit thing brightens with (`filter`). A
 * control that is already in force is not asked — it is saying "you are here", and a second answer on
 * top of that would be two answers to the same question — and neither is a disabled control, nor a
 * field, whose answer is the keyboard's ring.
 */
async function silent(window: Page, where: string, scope: Locator): Promise<string[]> {
  const look = async (target: Locator) =>
    await target.evaluate((node) => {
      const style = getComputedStyle(node as Element)
      return [style.backgroundColor, style.borderTopColor, style.color, style.filter, style.boxShadow].join(' | ')
    })
  const found: string[] = []
  const controls = scope.locator('button:not([disabled]), a[href], summary')
  await waitForControls(scope, where)
  for (const target of await controls.all()) {
    const inForce = await target.evaluate((node) => {
      const element = node as Element
      const current = element.getAttribute('aria-current')
      return (
        (current !== null && current !== 'false') ||
        element.getAttribute('aria-pressed') === 'true' ||
        element.getAttribute('aria-checked') === 'true' ||
        element.getAttribute('aria-selected') === 'true'
      )
    })
    if (inForce) continue
    const before = await look(target)
    await target.hover()
    // Past the fade: 150–220ms is mid-answer, and a control read there looks like one that answered.
    await window.waitForTimeout(260)
    if ((await look(target)) === before) {
      const name = await target.evaluate((node) =>
        (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 28),
      )
      found.push(`${where}: "${name}"`)
    }
  }
  return found
}

/**
 * No control is silent under the pointer (C5.6). A hand passing over something it can press is told so,
 * by whichever way that control's family answers: the fill changes (a row, a button), the frame (a
 * chip), the ink (a word), or the light a lit thing brightens. A control that says nothing is a control
 * a person has to press to find out about — the agent panel's `Install pi for me` was one, with an
 * accent frame and no answer at all. The screens are swept in one window each, because a gate exists
 * only while a turn waits and the first screen only before a folder.
 */
test('every control answers the pointer, in one of the three ways', async () => {
  test.setTimeout(180_000)
  const { app, window } = await launch()

  const page = window.getByRole('main')
  const quiet: string[] = []

  // The workbench: the empty state's one button, then a turn's own controls and the ledger's rows.
  quiet.push(...(await silent(window, 'the empty workbench', page)))
  await ask(window, 'say something')
  await settled(window)
  quiet.push(...(await silent(window, 'a conversation', page)))
  quiet.push(...(await silent(window, 'a conversation', window.getByRole('complementary'))))

  // The strip, which is chrome rather than a page.
  quiet.push(...(await silent(window, 'the band', window.getByRole('main').locator('[class*="h-14"]').first())))

  // The command palette, and the two menus a chip opens.
  await window.keyboard.press('Control+k')
  const palette = window.getByRole('dialog', { name: 'Switch conversation' })
  await expect(palette).toBeVisible()
  quiet.push(...(await silent(window, 'the palette', palette)))
  await window.keyboard.press('Escape')
  await window.getByRole('button', { name: 'Full access' }).click()
  quiet.push(...(await silent(window, 'the level menu', window.getByRole('menu', { name: 'Permission level' }))))
  await window.keyboard.press('Escape')
  await window.getByRole('button', { name: 'Scripted model' }).click()
  quiet.push(...(await silent(window, 'the model menu', window.getByRole('menu').first())))
  await window.keyboard.press('Escape')

  // A conversation's own menu, which is drawn over the rail rather than in the page.
  const actions = window.getByRole('button', { name: /^Actions for / }).first()
  await actions.hover()
  await actions.click()
  await expect(window.getByRole('menuitem', { name: 'Archive' })).toBeVisible()
  quiet.push(...(await silent(window, 'a conversation menu', window.locator('div.rounded-overlay').first())))
  await window.keyboard.press('Escape')

  // The tasks page, a task's card, the form, and every settings panel.
  await window.getByRole('button', { name: 'Tasks' }).click()
  quiet.push(...(await silent(window, 'the tasks page', page)))
  await window.getByRole('button', { name: 'New task', exact: true }).click()
  await window.getByRole('textbox').first().fill('Nightly check')
  await window.getByRole('textbox').nth(1).fill('Read the notes and report.')
  await window.getByRole('button', { name: 'Save task' }).click()
  quiet.push(...(await silent(window, 'a task on the list', page)))
  await window.getByRole('main').getByRole('button', { name: 'Nightly check' }).first().click()
  quiet.push(...(await silent(window, 'the task form', page)))
  await window.getByRole('link', { name: 'Settings' }).click()
  quiet.push(
    ...(await silent(window, 'the settings menu', window.getByRole('navigation', { name: 'Settings sections' }))),
  )
  for (const tab of SETTINGS_TABS) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    quiet.push(...(await silent(window, `settings: ${tab}`, page)))
  }

  expect(quiet, `these controls answer the pointer with nothing:\n  ${quiet.join('\n  ')}`).toEqual([])

  await app.close()
})

/**
 * And the two screens the sweep above cannot reach, because each needs a window of its own: the gate,
 * which exists only while a turn waits for a decision, and the screen a person sees before they have a
 * folder at all. A rule about every control is only a rule about the controls someone looked at.
 */
test('the controls of a gate and of the first screen answer too', async () => {
  test.setTimeout(120_000)
  const gate = await launch({ level: 'ask' })
  await ask(gate.window, 'change the file')
  await expect(gate.window.getByRole('button', { name: 'Allow once' })).toBeVisible({ timeout: 30_000 })
  const onTheGate = await silent(gate.window, 'the gate', gate.window.getByRole('main'))
  expect(onTheGate, `these controls answer the pointer with nothing:\n  ${onTheGate.join('\n  ')}`).toEqual([])
  await gate.app.close()

  const first = await launch({ noFolder: true })
  const onTheFirstScreen = await silent(first.window, 'the first screen', first.window.getByRole('main'))
  expect(
    onTheFirstScreen,
    `these controls answer the pointer with nothing:\n  ${onTheFirstScreen.join('\n  ')}`,
  ).toEqual([])
  await first.app.close()
})

/**
 * A form page fills the pane the rail leaves it, and it keeps the page's own edge. The filling is
 * the point: a settings row is a label and the control that belongs to it, and a panel that caps
 * itself leaves the window's right half as dead weight the controls could have used. What it may not
 * do is centre itself or drift: the band's title stands on the page's own padding at every width, so
 * growing the window never moves the page the reader was reading (C5.3, C5.4).
 */
test('a form page fills the pane, and it keeps the page’s own edge', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()

  /** Where a form page's parts stand: the column, the title, what the band acts with, the widest block. */
  const parts = async (): Promise<{
    column: number[]
    width: number
    title: number
    action: number
    block: number
    edge: number
  }> =>
    await window.getByRole('main').evaluate((node) => {
      const round = (value: number) => Math.round(value)
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return { x: round(rect.x), right: round(rect.right) }
      }
      const columns = [...node.querySelectorAll('[data-column="form"]')].map(box)
      const band = node.querySelector('[class*="h-14"][class*="border-b"]')
      const actions = [...(band?.querySelectorAll('button, select, a[href]') ?? [])]
      const blocks = [...node.querySelectorAll('[class*="rounded-card"]')].filter(
        (block) => !(band?.contains(block) ?? false),
      )
      return {
        // The column's own left edge, once per wrapper that claims it: they have to agree.
        column: [...new Set(columns.map((one) => one.x))],
        width: columns.length === 0 ? -1 : Math.max(...columns.map((one) => one.right - one.x)),
        title: round(band?.querySelector('h1')?.getBoundingClientRect().x ?? -1),
        action:
          actions.length === 0 ? -1 : Math.max(...actions.map((action) => round(action.getBoundingClientRect().right))),
        block:
          blocks.length === 0 ? -1 : Math.max(...blocks.map((block) => round(block.getBoundingClientRect().right))),
        // The page's own right edge: the pane's hairline, then the page padding and the wheel's room.
        edge: round(node.getBoundingClientRect().right - 33),
      }
    })

  const seen: Record<string, number> = {}
  const measure = async (page: string, name: string): Promise<void> => {
    await expect(window.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(name)
    const found = await parts()
    // One left edge, whatever the page carries: a page is a fact about its parts agreeing.
    expect(found.column, `the columns on ${page}: ${JSON.stringify(found)}`).toHaveLength(1)
    expect(found.title, `the band's title on ${page}`).toBe(found.column[0])
    // The page fills the pane the rail leaves: the widest block reaches the page's own right edge,
    // not up to a cap of its own.
    if (found.block > 0) {
      expect({ page, block: found.block }, `the body fills the page on ${page}`).toEqual({ page, block: found.edge })
    }
    // And what acts on the page — up to and including the window's three — ends on that same edge.
    if (found.action > 0) {
      expect({ page, action: found.action }, `the band's action on ${page}`).toEqual({ page, action: found.edge })
    }
    seen[page] = found.title
  }

  await window.getByRole('button', { name: 'Tasks' }).click()
  await measure('the tasks page', 'Tasks')
  await window.getByRole('link', { name: 'Settings' }).click()
  for (const tab of SETTINGS_TABS) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    await measure(`settings: ${tab}`, tab)
  }

  // And the same six pages again in a narrower window: the title's x is the page's own, so it is the
  // same x. This is the whole point of not centring a form's column — a page whose heading moved when
  // the window did is a page that looks like it was shifted sideways.
  const wide = seen
  const narrow: Record<string, number> = {}
  await window.setViewportSize({ width: 1000, height: 700 })
  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.getByRole('main').getByRole('heading', { level: 1 }).waitFor()
  narrow['the tasks page'] = (await parts()).title
  await window.getByRole('link', { name: 'Settings' }).click()
  for (const tab of SETTINGS_TABS) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    await window.getByRole('main').getByRole('heading', { level: 1 }).waitFor()
    narrow[`settings: ${tab}`] = (await parts()).title
  }
  expect(narrow, `the titles move with the window: ${JSON.stringify({ wide, narrow })}`).toEqual(wide)

  await app.close()
})

/**
 * A panel is groups, and the groups are one rhythm apart. The panel's sentence is not a group: it is
 * the panel, said once, and the first group starts under it — the same distance on every panel, or
 * the five panels read as five pages assembled by five people. Between one group and the next is the
 * panel's own rule and its own lead-in; a group whose first line touches the block above it belongs
 * to no rhythm at all, which is how the keychain notice came to sit on the sentence under it.
 */
test('a panel\u2019s groups are one rhythm apart', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()
  await window.getByRole('link', { name: 'Settings' }).click()

  /**
   * What the container gives each group it holds: the rule above it, the lead-in inside it, and where
   * its first line therefore starts. Measured on the group's own box — its padding is the lead-in —
   * because that is where the rhythm is drawn, and measured against the group above it because two
   * groups that touch are the thing that has no rhythm at all.
   */
  const rhythm = async (): Promise<{ lead: number; rules: number[]; seams: number[]; touches: number[] }> =>
    await window.getByRole('main').evaluate((node) => {
      const round = (value: number) => Math.round(value)
      const container = node.querySelector('[data-groups="panel"]')
      const note = container?.previousElementSibling
      const groups = [...(container?.children ?? [])]
      const boxes = groups.map((group) => group.getBoundingClientRect())
      const inside = groups.map((group) => {
        const rect = group.getBoundingClientRect()
        const style = getComputedStyle(group)
        return {
          top: rect.top + Number.parseFloat(style.paddingTop),
          bottom: rect.bottom - Number.parseFloat(style.paddingBottom),
        }
      })
      const rules: number[] = []
      const seams: number[] = []
      const touches: number[] = []
      for (let i = 1; i < groups.length; i += 1) {
        // The rule between two groups, wherever the container draws it: `divide-y` puts it under the
        // group above, a card brings its own border with it.
        const above = Number.parseFloat(getComputedStyle(groups[i - 1]).borderBottomWidth) || 0
        const below = Number.parseFloat(getComputedStyle(groups[i]).borderTopWidth) || 0
        rules.push(above + below)
        seams.push(round(boxes[i].top - boxes[i - 1].bottom))
        touches.push(round(inside[i].top - inside[i - 1].bottom))
      }
      return {
        // The panel's own sentence, and where its first group starts under it — the box, because what
        // is inside the group is the group's own business.
        lead:
          note === null || note === undefined || boxes.length === 0
            ? -1
            : round(boxes[0].top - note.getBoundingClientRect().bottom),
        rules,
        seams,
        touches,
      }
    })

  const leads: Record<string, number> = {}
  const seams: number[] = []
  for (const tab of SETTINGS_TABS) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    // The window's three live in the band now, so a band button is no proof the panel has drawn
    // itself: wait for the groups the panel actually holds.
    await expect
      .poll(async () => await window.getByRole('main').locator('[data-groups="panel"] > *').count(), {
        timeout: 5_000,
        message: `${tab} has no groups to space`,
      })
      .toBeGreaterThan(0)
    const found = await rhythm()
    // Every panel has to have been measured, not merely visited.
    expect({ tab, lead: found.lead }).not.toEqual({ tab, lead: -1 })
    leads[tab] = found.lead
    // A rule between every two groups: that is what says two groups are two.
    expect(
      { tab, unruled: found.rules.filter((rule) => rule < 1) },
      `the rules on ${tab}: ${JSON.stringify(found)}`,
    ).toEqual({ tab, unruled: [] })
    // And the room between two groups is one number, the same in every panel: a panel whose groups
    // were 0, 8, 16 and 37px apart would be a panel assembled in four sittings.
    seams.push(...found.seams)
    // Nothing touches: a group whose last line and the next group's first line are within a rule of
    // each other is a group the panel never spaced.
    expect(
      { tab, touches: found.touches.filter((gap) => gap < 16) },
      `the panels touch: ${JSON.stringify(found)}`,
    ).toEqual({ tab, touches: [] })
  }
  // The sweep has to have found what it is about: five panels, and more than one of them grouped.
  expect(
    seams.length,
    `the panels that have groups to space: ${JSON.stringify({ leads, seams })}`,
  ).toBeGreaterThanOrEqual(3)
  expect([...new Set(seams)], `the room between two groups: ${JSON.stringify(seams)}`).toEqual([20])
  // And the first group of every panel starts the same distance under the panel's own sentence.
  const distinct = [...new Set(Object.values(leads))]
  expect(distinct, `the panels lead with: ${JSON.stringify(leads)}`).toHaveLength(1)

  await app.close()
})

/**
 * The rail is a tree, and a tree is read in one x per level. The places one can go, the folders and
 * the door to settings are the rail's own rows and stand on one x — including their names, which is
 * where a rail starts looking hand-assembled, because a 2px difference between one row's name and the
 * next reads as a mistake rather than as a hierarchy. A task runs in a folder and is *in* it, so it
 * indents one step past the folder it belongs to rather than standing where the folder stands, and the
 * runs under a task indent one step further. Every step is the same step.
 */
test('the rail is a tree, and a tree is read in one x per level', async () => {
  test.setTimeout(180_000)
  const { app, window } = await launch({ replies: ['Noted from the first turn.', 'The nightly check found nothing.'] })

  // A folder with a conversation in it, and a task that has run once: the rail's three levels.
  await ask(window, 'first question')
  await settled(window)
  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.getByRole('button', { name: 'New task', exact: true }).click()
  await window.getByLabel('Name').fill('Nightly check')
  await window.getByLabel('What to ask').fill('read the notes and report')
  await window.getByRole('button', { name: 'Save task' }).click()
  // The card in the list is the way in to a task: its history is where a run's outcome is written.
  await window.getByRole('main').getByRole('button', { name: 'Nightly check' }).first().click()
  await window.getByRole('button', { name: 'Run now' }).click()
  await expect(
    window
      .getByRole('main')
      .getByText(/Finished/)
      .first(),
  ).toBeVisible({ timeout: 30_000 })
  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await window
    .getByRole('complementary')
    .getByRole('button', { name: /Expand the tasks in/ })
    .click()

  const rail = window.getByRole('complementary')

  /** A row's own box, and the box of the name inside it: the row's step and the name's x. */
  const rowAt = async (target: Locator): Promise<{ x: number; name: number }> =>
    await target.evaluate((node) => {
      const round = (value: number) => Math.round(value)
      const label = (row: Element) => {
        const name = row.querySelector('span.min-w-0')
        return name === null ? -1 : round(name.getBoundingClientRect().x)
      }
      return { x: round(node.getBoundingClientRect().x), name: label(node) }
    })

  /**
   * The first row a row *holds* — the list that follows it — measured the same way. A run is titled
   * with its task's name and shows its age, so it has no name of its own to ask for: what it is, is
   * what holds it.
   */
  const heldBy = async (row: Locator): Promise<{ x: number; name: number }> =>
    await row.evaluate((node) => {
      const round = (value: number) => Math.round(value)
      const holder = node.closest('div') ?? node.parentElement
      const held = holder?.nextElementSibling?.querySelector('button')
      if (held === null || held === undefined) return { x: -1, name: -1 }
      const name = held.querySelector('span.min-w-0')
      return {
        x: round(held.getBoundingClientRect().x),
        name: name === null ? -1 : round(name.getBoundingClientRect().x),
      }
    })

  const place = await rowAt(rail.getByRole('button', { name: /^Search/ }))
  const folderRow = rail.getByRole('button', { name: 'Collapse sandbox' })
  const folder = await rowAt(folderRow)
  const door = await rowAt(rail.getByRole('link', { name: /^Settings/ }))
  const taskRow = rail.getByRole('button', { name: /the tasks in Nightly check/ })
  const conversation = await heldBy(folderRow)
  const task = await rowAt(taskRow)
  const run = await heldBy(taskRow)

  // Every one of them was found, names included: a part measured as -1 is a part that is not there.
  const found = { place, folder, door, conversation, task, run }
  expect(
    Object.entries(found).filter(([, row]) => row.x <= 0 || row.name <= 0),
    `the rows the rail did not draw: ${JSON.stringify(found)}`,
  ).toEqual([])

  // The rail's own rows — a place, a folder, the door — are one row in one x, names included.
  expect({ place, folder, door }).toEqual({ place, folder: place, door: place })

  // And what a row holds stands one step past it, the same step at every level.
  const step = conversation.x - folder.x
  expect(step, `the rail's step is ${step}px`).toBeGreaterThanOrEqual(8)
  expect({ task: task.x - folder.x, run: run.x - task.x }).toEqual({ task: step, run: step })
  expect({ conversation: conversation.name - folder.name, task: task.name - folder.name }).toEqual({
    conversation: step,
    task: step,
  })
  expect(run.name).toBeGreaterThan(task.name)

  await app.close()
})
