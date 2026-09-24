import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { launchWorkbench, sizeWindow } from './agent'
import { closeScriptedProviders } from './scripted-provider'

/**
 * The queue the workbench owns (ADR-0011): a message typed while the agent is working waits for
 * the turn to end, can be edited where it stands, can be deleted, and — when it cannot be sent at
 * all — stops the queue and says so.
 */
const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

test.afterEach(() => closeScriptedProviders())

async function launch() {
  // The first turn is long enough to type two messages behind it: what is being tested is the
  // queue, not a race against a fast answer.
  return launchWorkbench({
    level: 'full-access',
    replies: [`${'a'.repeat(240)}.`, 'The second answer.'],
    slow: { tokenSize: 3, tokensPerSecond: 30 },
  })
}

const composer = (window: Page) => window.getByRole('textbox', { name: 'Message the agent' })

/** Types while the agent is working and puts it in the queue rather than into the turn. */
async function queue(window: Page, text: string) {
  await composer(window).fill(text)
  // Exact, because the strip's own labels say "queued message" and would match a substring.
  await window.getByRole('button', { name: 'Queue', exact: true }).click()
}

test('a queued message waits, is edited where it stands, and then goes', async () => {
  const { app, window } = await launch()

  await composer(window).fill('first task')
  await composer(window).press('Enter')
  await expect(window.getByRole('button', { name: 'Queue', exact: true })).toBeVisible({ timeout: 15_000 })

  await queue(window, 'the second thing')
  await queue(window, 'the third thing')

  const strip = window.getByRole('list', { name: 'Queued messages' })
  await expect(strip.getByText('the second thing')).toBeVisible()
  await expect(strip.getByText('the third thing')).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'queue-strip.png') })

  // Editing the older one leaves it where it is: the point of owning the queue is that a change is
  // not the same as typing it again at the back.
  await window.getByRole('button', { name: 'Edit the queued message: the second thing' }).click()
  const field = window.getByRole('textbox', { name: 'Edit the queued message: the second thing' })
  await field.fill('the second thing, better')
  await field.press('Enter')
  const texts = await strip.locator('li').allInnerTexts()
  expect(texts[0]).toContain('the second thing, better')
  expect(texts[1]).toContain('the third thing')

  // Deleting one takes it out without touching the other.
  await window.getByRole('button', { name: 'Delete the queued message: the third thing' }).click()
  await expect(strip.getByText('the third thing')).toHaveCount(0)

  await expect(window.getByRole('main').getByText('The second answer.')).toBeVisible({ timeout: 20_000 })
  const transcript = await window.getByRole('main').innerText()
  expect(transcript).toContain('the second thing, better')
  expect(transcript).not.toContain('the third thing')

  await app.close()
})

test('cancelling one steer keeps the other in the running turn', async () => {
  const { app, window } = await launch()

  await composer(window).fill('first task')
  await composer(window).press('Enter')
  await expect(window.getByRole('button', { name: 'Steer', exact: true })).toBeVisible({ timeout: 15_000 })

  await composer(window).fill('cancel this')
  await window.getByRole('button', { name: 'Steer', exact: true }).click()
  await composer(window).fill('keep this')
  await window.getByRole('button', { name: 'Steer', exact: true }).click()

  const strip = window.getByRole('list', { name: 'Queued messages' })
  await expect(strip.getByText('cancel this')).toBeVisible()
  await expect(strip.getByText('keep this')).toBeVisible()
  await window.getByRole('button', { name: 'Cancel the queued message: cancel this' }).click()
  await expect(strip.getByText('cancel this')).toHaveCount(0)
  await expect(strip.getByText('keep this')).toBeVisible()

  const said = window.getByRole('main').locator('[data-role="user"]')
  await expect(said.filter({ hasText: 'keep this' })).toHaveCount(1, { timeout: 20_000 })
  await expect(said.filter({ hasText: 'cancel this' })).toHaveCount(0)
  await app.close()
})

test('a queue and a full draft still leave the composer inside the page', async () => {
  const { app, window } = await launch()
  // A short window, because the workbench can be served to a browser (ADR-0009) and a browser
  // window can be any height: the box holds its own contents rather than pushing its controls off
  // the bottom of the page.
  await sizeWindow(app, window, 1024, 520)

  await composer(window).fill('the running turn')
  await composer(window).press('Enter')
  await expect(window.getByRole('button', { name: 'Queue', exact: true })).toBeVisible({ timeout: 15_000 })

  for (let index = 0; index < 8; index += 1) await queue(window, `waiting ${index}`)
  await composer(window).fill('a draft long enough that the box grows to its own cap. '.repeat(20))

  const page = await window.getByRole('main').boundingBox()
  const box = await composer(window).boundingBox()
  const foot = await window.getByRole('button', { name: 'Scripted model', exact: true }).boundingBox()
  if (page === null || box === null || foot === null) throw new Error('nothing to measure')

  // The page's own bottom edge is the limit, and the words and the controls that send them are
  // inside it — the queue scrolled rather than the composer being clipped.
  expect(box.y + box.height).toBeLessThanOrEqual(page.y + page.height)
  expect(foot.y + foot.height).toBeLessThanOrEqual(page.y + page.height)

  // The queue went into a box of its own rather than off the page: it scrolls, and every waiting
  // message is still reachable in it.
  const list = window.getByRole('list', { name: 'Queued messages' })
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(window.getByText('waiting 7')).toBeVisible()

  await app.close()
})

test('a narrow window leaves the composer inside the page too', async () => {
  const { app, window } = await launch()
  await composer(window).fill('the only thing')
  await composer(window).press('Enter')
  await expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 20_000 })

  // The same demand on the other axis (ADR-0009): a browser window can be any width as well as any
  // height. The page's own edges are the limit sideways, and the foot row of the writing box — the
  // attach control, the level chip, the model chip, the effort knob and the control that sends —
  // gives up its own width rather than running off the page (C5.3, C5.4). 700 and 480 are under any
  // desktop window (`minWidth` is 1024) and reachable only through the browser; 480 is where the
  // workbench stops being two columns and shows one at a time, so the page there is the whole width
  // and the row's own room is the whole page (C5.4).
  for (const width of [1024, 700, 480]) {
    await sizeWindow(app, window, width, 640)
    // The shape follows the width a frame behind it — the page is one width when the window reports
    // it and the phone's shape once the renderer has heard — so the reading is polled.
    await expect
      .poll(
        async () => {
          const at = await window.getByRole('main').boundingBox()
          return at === null ? null : `${at.x}×${Math.round(at.width)}`
        },
        { message: `the page should stand at its ${width} shape` },
      )
      .toBe(width <= 480 ? `0×${width}` : `256×${width - 256}`)

    const page = await window.getByRole('main').boundingBox()
    const send = await window.getByRole('button', { name: 'Send', exact: true }).boundingBox()
    const attach = await window.getByRole('button', { name: 'Attach a picture' }).boundingBox()
    if (page === null || send === null || attach === null) throw new Error('nothing to measure')

    // The row's two ends are inside the page: the control that sends at its right end, the control
    // that attaches at its left.
    expect(send.x + send.width, `the foot row runs past the page's right edge at ${width}`).toBeLessThanOrEqual(
      page.x + page.width,
    )
    expect(attach.x, `the foot row runs past the page's left edge at ${width}`).toBeGreaterThanOrEqual(page.x)

    // And at the widths a desktop window can have, nothing about the box moves the page at all.
    if (width >= 1024) {
      const sideways = await window.getByRole('main').evaluate((element) => element.scrollWidth - element.clientWidth)
      expect(sideways, `the page scrolls sideways at ${width}`).toBeLessThanOrEqual(0)
    }
  }

  await app.close()
})

test('Stop stops the queue too, and Resume sends what was waiting', async () => {
  const { app, window } = await launch()

  await composer(window).fill('first task')
  await composer(window).press('Enter')
  await expect(window.getByRole('button', { name: 'Queue', exact: true })).toBeVisible({ timeout: 15_000 })

  await queue(window, 'the waiting one')
  // Stop means stop: the queue does not fire the moment the turn it waited behind is cut short.
  await window.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(window.getByText('The queue is stopped.')).toBeVisible({ timeout: 15_000 })
  await window.screenshot({ path: join(SHOT_DIR, 'queue-stopped.png') })

  await window.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(window.getByRole('main').getByText('the waiting one')).toBeVisible({ timeout: 20_000 })
  await expect(window.getByText('The queue is stopped.')).toHaveCount(0)

  await app.close()
})
