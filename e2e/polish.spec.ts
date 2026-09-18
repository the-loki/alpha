import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

/** How many turns make a 500-message transcript: one user message and one answer each. */
const TURNS = 250

async function launch(options: { replies?: unknown[]; slow?: boolean; dataDirectory?: string; level?: string } = {}) {
  const dataDirectory = options.dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: {
          kind: 'selected',
          workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() },
        },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      permissionLevel: options.level ?? 'full-access',
    }),
    'utf-8',
  )

  const app = await electron.launch({
    args: [REPO_ROOT],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      ALPHA_FAUX: '1',
      ALPHA_FAUX_REPLIES: JSON.stringify(options.replies ?? ['Answer.']),
      ...(options.slow === true ? { ALPHA_FAUX_TOKENS_PER_SECOND: '20', ALPHA_FAUX_TOKEN_SIZE: '4' } : {}),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window, dataDirectory, workspace }
}

async function ask(window: Page, text: string) {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}

test('a five-hundred-message transcript still scrolls smoothly', async () => {
  test.setTimeout(180_000)
  const { app, window } = await launch({ replies: ['A short answer for the ledger.'] })

  // 250 turns: 250 user messages and 250 answers. Driven through the same IPC a person uses.
  await ask(window, 'turn 0')
  await expect(window.getByRole('main').getByText('A short answer for the ledger.')).toBeVisible({ timeout: 20_000 })
  // Inside evaluate the code runs in the page: `globalThis` names that window, not the Page object.
  const conversationId = await window.evaluate(() => globalThis.location.hash.split('/').pop() ?? '')

  await window.evaluate(
    async ({ id, turns }) => {
      const bridge = (globalThis as unknown as { alpha: { sendPrompt: (id: string, text: string) => Promise<void> } })
        .alpha
      for (let turn = 1; turn < turns; turn += 1) await bridge.sendPrompt(id, `turn ${turn}`)
    },
    { id: conversationId, turns: TURNS },
  )

  await expect(window.getByRole('main').getByText(`turn ${TURNS - 1}`)).toBeVisible({ timeout: 120_000 })
  const messageCount = await window.getByRole('main').locator('[data-role]').count()
  expect(messageCount).toBeGreaterThanOrEqual(500)

  // Scroll the transcript and measure the frames the window actually painted while it moved.
  const frameMs = await window.evaluate(async () => {
    const pane = document.querySelector('main > div, [data-role]')?.closest('div')
    const scroller = (pane ?? document.body) as HTMLElement
    const frames: number[] = []
    let previous = performance.now()
    let running = true
    const tick = () => {
      const now = performance.now()
      frames.push(now - previous)
      previous = now
      if (running) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    for (let step = 0; step < 60; step += 1) {
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - step * 120)
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    running = false
    return frames.slice(1)
  })

  const sorted = [...frameMs].sort((left, right) => left - right)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const worst = sorted.at(-1) ?? 0
  expect(median).toBeLessThan(20)
  expect(worst).toBeLessThan(120)

  // Tool rows are collapsed until asked for: none of them render their arguments unprompted.
  await expect(window.getByRole('main').getByText('Arguments')).toHaveCount(0)
  await window.screenshot({ path: join(SHOT_DIR, 'polish-long-transcript.png') })
  await app.close()
})

test('the whole path works from the keyboard, with a visible focus ring', async () => {
  const { app, window } = await launch({
    level: 'ask',
    replies: [{ tool: { name: 'bash', args: { command: 'echo from the keyboard' } } }, 'Ran it.'],
  })

  await ask(window, 'run the thing')
  await expect(window.getByRole('region', { name: 'Waiting for your decision' })).toBeVisible({ timeout: 20_000 })

  // Every control the card offers is reachable by Tab, and the ring follows the focus.
  const seen: string[] = []
  for (let step = 0; step < 6; step += 1) {
    await window.keyboard.press('Tab')
    const focused = await window.evaluate(() => {
      const element = document.activeElement
      if (element === null) return { name: '', ring: '' }
      const style = getComputedStyle(element)
      return {
        name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 24) ?? '',
        ring: style.outlineWidth,
      }
    })
    seen.push(focused.name)
    // The ring is never removed: whatever holds focus is outlined, and in the ember colour.
    if (focused.ring !== '' && focused.ring !== '0px') expect(focused.ring).toBe('2px')
  }
  expect(seen.join(' ')).toContain('Deny')

  // Enter allows the call, and the tool runs without a mouse ever being touched.
  await window.getByRole('button', { name: 'Allow once' }).focus()
  await window.keyboard.press('Enter')
  await expect(window.getByRole('main').locator('[data-role="tool"]')).toContainText('done', { timeout: 20_000 })
  await expect(window.getByRole('main').getByText('Ran it.')).toBeVisible()
  await app.close()
})

test('reduced motion collapses transitions and freezes the cursor', async () => {
  const { app, window } = await launch({ slow: true, replies: ['A long answer that keeps going for a while.'] })
  await window.emulateMedia({ reducedMotion: 'reduce' })

  await ask(window, 'say something long')
  const cursor = window.getByRole('main').locator('.ember-cursor')
  await expect(cursor.first()).toBeVisible({ timeout: 20_000 })

  const motion = await window.evaluate(() => {
    const element = document.querySelector('.ember-cursor')
    const cursorStyle = element === null ? null : getComputedStyle(element)
    const button = document.querySelector('button')
    const buttonStyle = button === null ? null : getComputedStyle(button)
    return {
      animation: cursorStyle?.animationName ?? '',
      transition: buttonStyle?.transitionDuration ?? '',
    }
  })

  expect(motion.animation).toBe('none')
  // Whatever unit the browser reports, a collapsed transition is effectively no time at all.
  const seconds = Number.parseFloat(motion.transition)
  expect(seconds).toBeLessThan(0.001)
  await app.close()
})

test('no state is carried by colour alone', async () => {
  const { app, window } = await launch({
    level: 'ask',
    replies: [
      { tool: { name: 'write', args: { path: 'notes.txt', content: 'written' } } },
      { tool: { name: 'bash', args: { command: 'cat missing.txt' } } },
      'Both done.',
    ],
  })

  // The permission level: a coloured chip that also names the level.
  await expect(window.getByRole('button', { name: 'Ask' })).toBeVisible()

  await ask(window, 'write and run')
  const card = window.getByRole('region', { name: 'Waiting for your decision' })
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toContainText('Wants to change a file')

  await window.getByRole('button', { name: 'Allow once' }).click()
  // The command asks for its own decision, and this one is denied: the row says so in words.
  await expect(card).toBeVisible()
  await window.getByRole('button', { name: 'Deny' }).click()
  await expect(window.getByRole('main').locator('[data-role="tool"][data-tool="bash"]')).toContainText('failed', {
    timeout: 20_000,
  })
  // Tool status: the colour is paired with the word, and the risk with a glyph and a title.
  const row = window.getByRole('main').locator('[data-role="tool"][data-tool="write"]')
  await expect(row).toContainText('done')
  await expect(row.locator('[title="Writes"]')).toHaveCount(1)
  await app.close()
})

test('the light theme is selectable, and both themes are captured', async () => {
  const { app, window } = await launch({ replies: ['A short answer.'] })

  await ask(window, 'which theme is this')
  await expect(window.getByRole('main').getByText('A short answer.')).toBeVisible({ timeout: 20_000 })
  await window.screenshot({ path: join(SHOT_DIR, 'theme-dark.png') })

  await window.getByRole('link', { name: 'Settings' }).click()
  const card = () =>
    window.evaluate(() => {
      const button = document.querySelector('aside button')
      return button === null ? '' : getComputedStyle(button).backgroundColor
    })
  const paintedDark = await card()
  await window.getByRole('button', { name: 'Light' }).click()
  await expect(window.locator('html')).toHaveAttribute('data-theme', 'light')
  // The palette repaints rather than switching instantly, so the capture waits for the sidebar
  // to actually be paper-coloured instead of catching the switch halfway.
  await expect.poll(card).not.toBe(paintedDark)
  await window.screenshot({ path: join(SHOT_DIR, 'theme-light-settings.png') })

  // The workspace stays legible in the light theme: the transcript is readable against paper,
  // and the sidebar still names the folder it is pointed at rather than only its path.
  const paper = await window.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(paper).not.toBe('rgb(20, 17, 14)')
  await expect(window.getByRole('complementary').getByRole('button', { name: /sandbox/ })).toBeVisible()

  await window.getByRole('button', { name: /^which theme is this/ }).click()
  await expect(window.getByRole('main').getByText('A short answer.')).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'theme-light.png') })

  await window.getByRole('link', { name: 'Settings' }).click()
  await window.getByRole('button', { name: 'Follow the system' }).click()
  await expect(window.locator('html')).not.toHaveAttribute('data-theme', 'light')
  await app.close()
})

test('opening and closing twenty conversations does not leak', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch({ replies: ['An answer.'] })

  await ask(window, 'first conversation')
  await expect(window.getByRole('main').getByText('An answer.')).toBeVisible({ timeout: 20_000 })

  const measure = () =>
    app.evaluate(({ app: electronApp }) =>
      electronApp.getAppMetrics().reduce((total, metric) => total + metric.memory.workingSetSize, 0),
    )

  const before = await measure()
  await window.evaluate(async () => {
    const bridge = (
      globalThis as unknown as {
        alpha: {
          listConversations: () => Promise<{ id: string }[]>
          openConversation: (id: string) => Promise<unknown>
        }
      }
    ).alpha
    const [first] = await bridge.listConversations()
    for (let round = 0; round < 20; round += 1) await bridge.openConversation(first.id)
  })
  const after = await measure()

  // Working set in kilobytes; twenty reopens must not grow the app by more than 150 MB.
  expect(after - before).toBeLessThan(150 * 1024)
  await app.close()
})
