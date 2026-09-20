import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Browser, chromium, _electron as electron, expect, test } from '@playwright/test'
import { APP_DIR, configureProvider, scriptedAgent } from './agent'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')
const TOKEN = 'the-token-a-person-would-paste'
const REPLY = 'Two files use that name. I can rename both.'
/** A first reply that asks to write a file, so the gate has something to ask about. */
const WRITE = { tool: { name: 'write', args: { path: 'made.txt', content: 'written by the agent' } } }

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
async function launchServing(port: number, options: { token?: string; level?: string; replies?: unknown[] } = {}) {
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
      permissionLevel: options.level ?? 'full-access',
      network: { enabled: true, port, bind: 'local', token: options.token ?? TOKEN },
    }),
    'utf-8',
  )

  // The suite hands a picture across the wire, so the connection serves a model that takes one.
  configureProvider(dataDirectory, { images: true })

  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      ALPHA_FAUX_REPLIES: JSON.stringify(options.replies ?? [REPLY]),
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

/** The desktop window's settings, on the browser-access panel, which the menu now keeps behind it. */
async function openBrowserAccess(window: Awaited<ReturnType<Browser['newPage']>>) {
  await window.getByRole('link', { name: 'Settings' }).click()
  await window.getByRole('link', { name: 'Browser access' }).click()
}

async function ask(page: Awaited<ReturnType<Browser['newPage']>>, text: string) {
  const composer = page.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}

/** Where another device on this network would reach this machine — not its loopback address. */
function networkAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return undefined
}

/** Whether a workbench answers there, asked through the one route that takes the token. */
async function answersAt(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: TOKEN }),
      signal: AbortSignal.timeout(3_000),
    })
    return response.ok
  } catch {
    return false
  }
}

test('a browser on the machine opens the workbench and runs a turn', async () => {
  const port = await freePort()
  const { app, url } = await launchServing(port)
  const browser = await chromium.launch()

  try {
    const page = await openInBrowser(browser, url, TOKEN)

    // The workbench itself, not a viewer: the same sidebar, the same composer, the same ledger.
    await expect(page.getByRole('complementary').getByRole('heading', { name: 'sandbox' })).toBeVisible()
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
})

test('a browser unlocks into the whole workbench, sidebar included', async () => {
  const port = await freePort()
  const { app, window, url } = await launchServing(port)

  try {
    // A conversation that already exists, made in the window: what a browser arrives to find.
    await ask(window, 'explain the parser module')
    await expect(window.getByRole('main').getByText(REPLY)).toBeVisible({ timeout: 20_000 })

    const browser = await chromium.launch()
    try {
      const page = await openInBrowser(browser, url, TOKEN)
      // The mount that was refused is the same mount that would have listed these: unlocking has to
      // ask again, or the workbench opens with an empty sidebar and a lie about what is in it.
      await expect(page.getByRole('button', { name: /^explain the parser module (idle|working)$/ })).toBeVisible()
    } finally {
      await browser.close()
    }
  } finally {
    await app.close()
  }
})

test('a picture picked in a browser crosses the wire and stays in the transcript', async () => {
  const port = await freePort()
  const { app, workspace, url } = await launchServing(port)
  // A real one-pixel PNG: what a browser hands over is the file's own bytes, and they have to
  // survive the POST, the body limit, and the session on disk.
  const shot = join(workspace, 'browser-shot.png')
  writeFileSync(
    shot,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  )

  const browser = await chromium.launch()
  try {
    const page = await openInBrowser(browser, url, TOKEN)
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Attach a picture' }).click()
    await (await chooser).setFiles(shot)
    await expect(page.getByRole('img', { name: 'browser-shot.png' })).toBeVisible()

    await ask(page, 'what is this')
    await expect(page.getByRole('main').getByRole('img', { name: 'Attached image' })).toBeVisible({
      timeout: 20_000,
    })
  } finally {
    await browser.close()
    await app.close()
  }
})

test('a browser is offered no folder picker, because it has none', async () => {
  const port = await freePort()
  const { app, url } = await launchServing(port)
  const browser = await chromium.launch()

  try {
    const page = await openInBrowser(browser, url, TOKEN)

    // The folders this workbench already works in are here, and the one thing that needs a dialog
    // the browser cannot have is replaced by the sentence that says why. The refusal is real
    // either way — the picker is refused in main — but a button that could only ever produce it
    // would be an offer the browser cannot keep.
    const sidebar = page.getByRole('complementary')
    await expect(sidebar.getByRole('heading', { name: 'sandbox' })).toBeVisible()
    await expect(sidebar.getByRole('button', { name: 'Add a folder' })).toHaveCount(0)
    await expect(sidebar.getByText('A folder can only be added in the desktop app.')).toBeVisible()
  } finally {
    await browser.close()
    await app.close()
  }
})

test('a replaced token sends the browser back to the unlock screen', async () => {
  const port = await freePort()
  const { app, window, url } = await launchServing(port)
  const browser = await chromium.launch()

  try {
    const page = await openInBrowser(browser, url, TOKEN)
    await expect(page.getByRole('main')).toBeVisible()

    // The desk replaces the token, which restarts the server and closes every stream with it.
    await openBrowserAccess(window)
    await window.getByRole('button', { name: 'Replace' }).click()

    // Nothing is clicked in the browser: a workbench it can no longer drive has to notice by
    // itself, or it sits there looking usable and refuses everything it is asked to do.
    await expect(page.getByLabel('Access token')).toBeVisible({ timeout: 20_000 })
  } finally {
    await browser.close()
    await app.close()
  }
})

test('a browser answers an approval card, and the tool runs on this machine', async () => {
  const port = await freePort()
  const { app, url, workspace } = await launchServing(port, { level: 'ask', replies: [WRITE, 'Done.'] })
  const browser = await chromium.launch()

  try {
    const page = await openInBrowser(browser, url, TOKEN)
    await ask(page, 'write the file')

    // The card arrives as an event and leaves as an invoke: the same gate, the same decision,
    // reached over the network instead of over IPC.
    const card = page.getByRole('region', { name: 'Waiting for your decision' })
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card).toContainText('made.txt')
    await page.getByRole('button', { name: 'Allow once' }).click()

    const row = page.getByRole('main').locator('[data-role="tool"][data-tool="write"]')
    await expect(row).toContainText('allowed once', { timeout: 20_000 })
    // The decision was a browser's; the file it allowed is on the machine the workbench runs on.
    await expect.poll(() => existsSync(join(workspace, 'made.txt'))).toBe(true)
  } finally {
    await browser.close()
    await app.close()
  }
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

test('the switch in Settings is what opens this machine to the network', async () => {
  const address = networkAddress()
  test.skip(address === undefined, 'this machine is on no network to be reached over')

  const port = await freePort()
  const { app, window } = await launchServing(port)
  const origin = `http://${address}:${port}`

  try {
    // Switched on, but bound where it was asked to bind: another device gets nothing, because
    // nothing is listening on that address at all.
    expect(await answersAt(origin)).toBe(false)

    await openBrowserAccess(window)
    await window.getByRole('button', { name: 'Anything on this network' }).click()
    await expect(window.getByRole('button', { name: 'Anything on this network' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // The same restart that widened the bind is what makes the address answer, and the token is
    // accepted there: the whole way in, not just the socket.
    await expect.poll(() => answersAt(origin), { timeout: 15_000 }).toBe(true)
    await expect(window.getByText(origin)).toBeVisible()
  } finally {
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
    await page.goto(`${url}/#/settings?tab=browser-access`)
    await expect(page.getByRole('heading', { name: 'Browser access' })).toBeVisible()
    await expect(page.getByText(/a browser cannot add a folder/i)).toBeVisible()
  } finally {
    await browser.close()
    await app.close()
  }
})
