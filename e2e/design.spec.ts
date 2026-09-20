import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Locator, type Page, test } from '@playwright/test'
import { APP_DIR, configureProvider, scriptedAgent } from './agent'

/**
 * The window seam (C4.2), measured rather than eyeballed: the app draws one content column, one height
 * for a control that has a body, and no square corners (C5.4). These are the numbers a redesign is
 * allowed to change deliberately and not by accident, and they are asserted through the window
 * because that is where a person sees them.
 */
const SCRIPT = [{ tool: { name: 'bash', args: { command: 'echo hello' } } }, 'It says hello from the ledger.']

async function launch(options: { level?: string } = {}) {
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
      permissionLevel: options.level ?? 'full-access',
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

test('every page keeps its content on the page\u2019s own edge', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  const pageLeft = async (): Promise<number> => (await box(window.getByRole('main'))).x
  const headingLeft = async (): Promise<number> =>
    (await box(window.getByRole('main').getByRole('heading', { level: 1 }))).x

  // The conversation's title is the reference: every other page's title is on the same x.
  const conversation = (await headingLeft()) - (await pageLeft())

  await window.getByRole('button', { name: 'Tasks' }).click()
  const tasks = (await headingLeft()) - (await pageLeft())
  // The body as well as the title: a page that centred its content would leave the title where it
  // is and move everything under it, which is the mistake this pass was about.
  const taskBody = (await box(window.getByRole('main').getByText('A task runs its prompt'))).x

  await window.getByRole('button', { name: 'New conversation' }).click()
  await window.getByRole('link', { name: 'Settings' }).click()
  const settings = (await headingLeft()) - (await pageLeft())
  const settingsBody = (await box(window.getByRole('main').getByRole('paragraph').first())).x

  expect({ tasks, settings }).toEqual({ tasks: conversation, settings: conversation })
  expect({ taskBody, settingsBody }).toEqual({ taskBody: settingsBody, settingsBody })
  expect(taskBody - (await box(window.getByRole('main'))).x).toBe(conversation)
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
    expect(block.radius, `${block.kind} is ${block.radius}`).toBe(block.nested ? '10px' : '16px')
  }

  // A notice, on the other hand, is a line and not a block: the same shape wherever it appears,
  // which is the control's radius rather than the card's.
  const notice = page.getByText('This system offers no keychain')
  expect(await paddingOf(notice)).toBe(NOTICE)
  expect(await notice.evaluate((node) => getComputedStyle(node).borderRadius)).toBe('10px')

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

test('the composer writes on the same x the entries write on', async () => {
  const { app, window } = await launch()
  await ask(window, 'say something')
  await settled(window)

  const entry = await box(window.getByRole('main').locator('[data-role="user"]').first().getByText('say something'))
  const words = await box(window.getByRole('textbox', { name: 'Message the agent' }))
  // The bar's own hairline is between the two, so the words land on the entries' column to within
  // the pixel the border costs — the eye cannot see the difference, and nothing else is allowed.
  expect(Math.abs(words.x - entry.x)).toBeLessThanOrEqual(1)

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

test('the rail and the settings menu are the same panel', async () => {
  const { app, window } = await launch()
  const rail = await box(window.getByRole('complementary'))
  await window.getByRole('link', { name: 'Settings' }).click()
  const menu = await box(window.getByRole('navigation', { name: 'Settings sections' }))
  expect(menu).toEqual(rail)
  await app.close()
})
