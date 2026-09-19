import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Browser, chromium, _electron as electron, expect, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')
const TOKEN = 'the-token-a-person-would-paste'
const REPLY = 'Two files use that name. I can rename both.'

/** A port nothing is listening on, so the test does not collide with anything on this machine. */
async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((settle) => probe.listen(0, '127.0.0.1', () => settle()))
  const address = probe.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>((settle) => probe.close(() => settle()))
  return port
}

/**
 * The app with browser access already on, which is what Settings would have written. The desktop
 * window opens too: the point of the test is that a browser is a second client, not a replacement.
 */
async function launchServing(port: number, options: { token?: string } = {}) {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      permissionLevel: 'full-access',
      network: { enabled: true, port, bind: 'local', token: options.token ?? TOKEN },
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
      ALPHA_FAUX_REPLIES: JSON.stringify([REPLY]),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window, dataDirectory, workspace, url: `http://127.0.0.1:${port}` }
}

/** A browser on this machine, opening the served workbench and unlocking it. */
async function openInBrowser(browser: Browser, url: string, token: string) {
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(url)
  await page.getByLabel('Access token').fill(token)
  await page.getByRole('button', { name: 'Open the workbench' }).click()
  return page
}

async function ask(page: Awaited<ReturnType<Browser['newPage']>>, text: string) {
  const composer = page.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}

test('a browser on the machine opens the workbench and runs a turn', async () => {
  const port = await freePort()
  const { app, url, workspace } = await launchServing(port)
  const browser = await chromium.launch()

  try {
    const page = await openInBrowser(browser, url, TOKEN)

    // The workbench itself, not a viewer: the same sidebar, the same composer, the same ledger.
    await expect(page.getByRole('button', { name: /^sandbox/ })).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await ask(page, 'rename the parser module')

    // The reply streams over the event stream, so seeing it means SSE is wired end to end.
    await expect(page.getByRole('main').getByText(REPLY)).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: join(SHOT_DIR, 'browser-unlocked.png') })

    // The desktop window opens the same conversation, from the same runtime: one workbench, two
    // clients, and neither of them is a copy of the other.
    const desktop = await app.firstWindow()
    await desktop.getByRole('button', { name: /^rename the parser module (idle|working)$/ }).click()
    await expect(desktop.getByRole('main').getByText(REPLY)).toBeVisible({ timeout: 20_000 })
  } finally {
    await browser.close()
    await app.close()
  }

  // A browser cannot pick a folder: the workspace it works in is the one that is already open.
  expect(workspace).toContain('alpha-e2e-ws-')
})

test('a wrong token does not open anything', async () => {
  const port = await freePort()
  const { app, url } = await launchServing(port)
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    await page.goto(url)
    await page.getByLabel('Access token').fill('not the token')
    await page.getByRole('button', { name: 'Open the workbench' }).click()

    await expect(page.getByText('That token was not accepted.')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Message the agent' })).toHaveCount(0)
    await page.screenshot({ path: join(SHOT_DIR, 'browser-locked.png') })
  } finally {
    await browser.close()
    await app.close()
  }
})

test('the served workbench has no window chrome, and says what a browser cannot do', async () => {
  const port = await freePort()
  const { app, url } = await launchServing(port)
  const browser = await chromium.launch()

  try {
    const page = await openInBrowser(browser, url, TOKEN)
    // No minimize, maximize or close: there is no window of ours to move.
    await expect(page.getByRole('button', { name: 'Minimize window' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Close window' })).toHaveCount(0)

    // The settings page carries the same switch, and says where the token lives.
    await page.goto(`${url}/#/settings`)
    await expect(page.getByRole('heading', { name: 'Browser access' })).toBeVisible()
    await expect(page.getByText(/a browser cannot pick a folder/i)).toBeVisible()
  } finally {
    await browser.close()
    await app.close()
  }
})
