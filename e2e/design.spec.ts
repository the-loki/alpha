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
      ALPHA_FAUX_REPLIES: JSON.stringify(options.replies ?? SCRIPT),
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
  // And a button with a frame is the control height in every panel — the agent's pair and the token's
  // pair used to be 2px taller than every other framed button in the app.
  const tokenButtons = await heights(
    window.getByRole('main').getByRole('button', { name: 'Copy', exact: true }),
    window.getByRole('main').getByRole('button', { name: 'Replace' }),
  )
  await window.getByRole('link', { name: 'Agent', exact: true }).click()
  const agentButtons = await heights(
    window.getByRole('main').getByRole('button', { name: 'Look again' }),
    window.getByRole('main').getByRole('button', { name: 'Copy the command' }),
  )
  expect([...themeChoice, ...reachChoice, ...tokenButtons, ...agentButtons]).toEqual(
    Array.from({ length: 6 }, () => CONTROL),
  )
  await window.getByRole('link', { name: 'Back to the workbench' }).click()

  // An action that is only its glyph is the same box wherever it is drawn: the rail's own heading and
  // the strip draw the same kind of control, and a 1.25rem glyph beside a 1.75rem one is two designs.
  const glyphs = await Promise.all(
    [window.getByRole('button', { name: 'Add a folder' }), window.getByRole('button', { name: 'Search' })].map(
      async (glyph) => {
        const rect = await box(glyph)
        return [rect.w, rect.h]
      },
    ),
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

/**
 * Where the page's column stops on the right. A wheel that appears when the content grows takes its
 * room out of the column it scrolls, so a page whose transcript is long ends 8px short of a page
 * whose content fits — and the band above it, which never scrolls and so never gives up the room,
 * ends 8px past the body it names. One page, one right edge, and the edge does not move when the
 * page grows (C5.4).
 */
test('a page ends on one right edge, whether or not it has grown long', async () => {
  const { app, window } = await launch({
    replies: [{ tool: { name: 'read', args: { path: 'notes.txt' } } }, 'It says hello from the ledger.'],
  })
  await ask(window, 'show me the notes')
  await settled(window)
  await ask(window, 'and again')
  await settled(window)

  /** Where the three things on a page stop: the entries, the band's last control, the composer's card. */
  const edges = async (): Promise<{ entry: number; band: number; composer: number; scrolls: boolean }> =>
    await window.getByRole('main').evaluate((node) => {
      const round = (value: number) => Math.round(value * 100) / 100
      const of = (element: Element | null | undefined) =>
        element === null || element === undefined ? -1 : round(element.getBoundingClientRect().right)
      const scroller = [...node.querySelectorAll('*')].find(
        (child) => getComputedStyle(child).overflowY === 'auto' && child.clientHeight > 0,
      )
      const band = node.querySelector('[class*="h-14"][class*="border-b"]')
      let card: Element | null = node.querySelector('textarea')
      while (card !== null && !card.className.toString().includes('rounded-card')) card = card.parentElement
      return {
        entry: of(node.querySelector('[data-role="tool"]')),
        band: of(band?.lastElementChild?.lastElementChild),
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
  // One page, one right edge: what the band ends on, what the entries end on, what the composer ends on.
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

  // And the same edge on a page that never grows long enough to have a wheel at all.
  await window.getByRole('button', { name: 'Tasks' }).click()
  const tasks = await window.getByRole('main').evaluate((node) => {
    const last = node.querySelector('[class*="h-14"][class*="border-b"]')?.lastElementChild
    const button = last?.lastElementChild ?? last
    let card: Element | null =
      [...node.querySelectorAll('p')].find((line) => (line.textContent ?? '').includes('No tasks')) ?? null
    while (card !== null && !card.className.toString().includes('rounded-card')) card = card.parentElement
    return {
      band: button === null || button === undefined ? -1 : Math.round(button.getBoundingClientRect().right * 100) / 100,
      card: card === null ? -1 : Math.round(card.getBoundingClientRect().right * 100) / 100,
    }
  })
  expect(tasks, `the tasks page: ${JSON.stringify(tasks)}`).toEqual({ band: roomy.entry, card: roomy.entry })

  await app.close()
})

/**
 * A line of prose, measured in the unit that matters to a reader: characters. The page's column is
 * wide, and prose that fills it is a hundred characters to the line — a wall a reader loses their
 * place in on every sweep back. The one voice is the display voice of the empty state, and the other
 * is the body voice of an answer, and both are capped by `--container-measure` (C5.4).
 */
test('a line of prose is a measure, not a wall', async () => {
  const paragraph =
    'A line of prose is read one line at a time, so its length is the one number a reader feels without naming ' +
    'it. When the line runs wider than a comfortable measure the eye loses its place on the return sweep, and ' +
    'the paragraph stops being a paragraph and becomes a wall of text with no shape in it for a reader to hold.'
  const { app, window } = await launch({ replies: [paragraph] })

  /** How many characters the eye travels before it sweeps back, in the element's own voice. */
  const perLine = async (target: Locator): Promise<{ chars: number; voice: string }> =>
    await target.evaluate((node) => {
      const style = getComputedStyle(node as Element)
      const probe = document.createElement('span')
      probe.style.cssText = `position:absolute;visibility:hidden;font:${style.font};white-space:pre;width:1ch`
      document.body.append(probe)
      const one = probe.getBoundingClientRect().width
      probe.remove()
      const widest = Math.max(...[...(node as Element).getClientRects()].map((rect) => rect.width))
      return { chars: Math.round(widest / one), voice: `${style.fontSize} ${style.fontFamily.split(',')[0]}` }
    })

  const READABLE = 70
  // The display voice is the empty state's own line; the body voice is the paragraph of an answer.
  const display = await perLine(window.getByRole('main').locator('p[class*="font-display"]').first())
  expect(display.chars, `the empty state: ${display.voice}`).toBeLessThanOrEqual(READABLE)

  await ask(window, 'show me the notes')
  await settled(window)
  const body = await perLine(window.getByRole('main').locator('p').filter({ hasText: 'comfortable measure' }).first())
  expect(body.chars, `an answer: ${body.voice}`).toBeLessThanOrEqual(READABLE)

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
  for (const tab of ['Agent', 'Providers', 'Permissions', 'Appearance', 'Browser access']) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    await named(tab)
  }
  expect(titles.length, `the pages name themselves in: ${titles.join(' / ')}`).toBe(7)
  expect(new Set(titles).size, `the page titles are ${JSON.stringify([...new Set(titles)])}`).toBe(1)
  expect(titles[0]).toContain('Newsreader')
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
  expect(own, `the first screen names itself: ${own}`).toBe('Newsreader 24px 500 none')
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
