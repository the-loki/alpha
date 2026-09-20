import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { configureProvider, scriptedAgent } from './agent'

/**
 * The queue the workbench owns (ADR-0011): a message typed while the agent is working waits for
 * the turn to end, can be edited where it stands, can be deleted, and — when it cannot be sent at
 * all — stops the queue and says so.
 */
const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

async function launch() {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
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
    }),
    'utf-8',
  )

  configureProvider(dataDirectory)

  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      // The first turn is long enough to type two messages behind it: what is being tested is the
      // queue, not a race against a fast answer.
      ALPHA_FAUX_REPLIES: JSON.stringify([`${'a'.repeat(240)}.`, 'The second answer.']),
      ALPHA_FAUX_TOKENS_PER_SECOND: '30',
      ALPHA_FAUX_TOKEN_SIZE: '3',
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window }
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
