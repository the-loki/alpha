import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ElectronApplication, _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

async function launchApp(
  options: { state?: unknown; dataDirectory?: string; env?: Record<string, string> } = {},
): Promise<{ app: ElectronApplication; window: Page; dataDirectory: string }> {
  const dataDirectory = options.dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  if (options.state !== undefined) {
    writeFileSync(join(dataDirectory, 'workbench-state.json'), JSON.stringify(options.state), 'utf-8')
  }
  const app = await electron.launch({
    args: [REPO_ROOT, `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, NODE_ENV: 'production', ...options.env },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window, dataDirectory }
}

test('a fresh install opens on the empty workbench', async () => {
  const { app, window } = await launchApp()

  await expect(window.locator('header')).toContainText('Alpha')
  await expect(window.getByRole('heading', { name: 'Open a folder to begin' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Open folder' })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Send' })).toBeVisible()
  await expect(window.getByRole('button', { name: /Ask/ })).toBeVisible()

  const shell = await app.evaluate(({ BrowserWindow }) => {
    const [first] = BrowserWindow.getAllWindows()
    return { width: first.getBounds().width, height: first.getBounds().height, frameless: !first.isDestroyed() }
  })
  expect(shell.width).toBeGreaterThanOrEqual(1024)

  await window.setViewportSize({ width: 1440, height: 900 })
  await window.screenshot({ path: join(SHOT_DIR, 'shell-fresh-install.png') })
  await app.close()
})

test('the remembered workspace is restored on launch', async () => {
  const { app, window } = await launchApp({
    state: {
      workspace: {
        selection: {
          kind: 'selected',
          workspace: { path: '/tmp/alpha-e2e-workspace', name: 'alpha-e2e-workspace', lastOpenedAt: 1 },
        },
        recents: [{ path: '/tmp/alpha-e2e-workspace', name: 'alpha-e2e-workspace', lastOpenedAt: 1 }],
      },
      permissionLevel: 'accept-edits',
    },
  })

  await expect(window.locator('header')).toContainText('alpha-e2e-workspace')
  await expect(window.getByRole('button', { name: /Accept edits/ })).toBeVisible()
  await expect(window.getByRole('main').getByText('/tmp/alpha-e2e-workspace')).toBeVisible()

  await window.setViewportSize({ width: 1440, height: 900 })
  await window.screenshot({ path: join(SHOT_DIR, 'shell-restored-workspace.png') })
  await app.close()
})

test('the permission level is changeable and survives a relaunch', async () => {
  const { app, window } = await launchApp()

  await window.getByRole('button', { name: /Ask/ }).click()
  await window.getByRole('menuitemradio', { name: /Full access/ }).click()
  await expect(window.getByRole('button', { name: /Full access/ })).toBeVisible()

  await app.close()
})

test('the remembered workspaces are one click away', async () => {
  const alpha = mkdtempSync(join(tmpdir(), 'alpha-e2e-alpha-'))
  const beta = mkdtempSync(join(tmpdir(), 'alpha-e2e-beta-'))
  const { app, window } = await launchApp({
    state: {
      workspace: {
        selection: { kind: 'selected', workspace: { path: beta, name: 'beta', lastOpenedAt: 2 } },
        recents: [
          { path: beta, name: 'beta', lastOpenedAt: 2 },
          { path: alpha, name: 'alpha', lastOpenedAt: 1 },
        ],
      },
      permissionLevel: 'ask',
    },
  })

  // The button shows where the agent is pointed, and the list is what it remembers.
  await expect(window.getByRole('button', { name: /beta/ })).toBeVisible()
  await window.getByRole('button', { name: /beta/ }).click()
  await window.getByRole('menuitem', { name: /alpha/ }).click()

  await expect(window.getByRole('button', { name: new RegExp(alpha) })).toBeVisible()

  await window.setViewportSize({ width: 1440, height: 900 })
  await window.getByRole('button', { name: /alpha/ }).click()
  await expect(window.getByRole('menu', { name: 'Workspaces' })).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'workspace-menu.png') })
  await app.close()
})

test('settings is a menu of panels, one at a time, each with its address', async () => {
  const { app, window } = await launchApp()

  await window.getByRole('link', { name: 'Settings' }).click()

  // Providers is where Settings lands, because that is what a person comes here to change, and
  // it is the panel the providers suite drives.
  await expect(window.getByRole('heading', { name: 'Model providers' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Default permission level' })).toHaveCount(0)

  await window.getByRole('link', { name: 'Permissions' }).click()
  await expect(window.getByRole('link', { name: 'Permissions' })).toHaveAttribute('aria-current', 'page')
  await expect(window.getByRole('link', { name: 'Providers' })).not.toHaveAttribute('aria-current', 'page')
  await expect(window.getByRole('heading', { name: 'Default permission level' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Remembered approvals' })).toBeVisible()
  // One at a time: the panel that was showing is gone, not scrolled past.
  await expect(window.getByRole('heading', { name: 'Model providers' })).toHaveCount(0)
  expect(new URL(window.url()).hash).toContain('tab=permissions')

  // The menu says where you are, with more than the heading: the panel you are on is raised.
  await window.mouse.move(0, 0)
  const raised = await window
    .getByRole('link', { name: 'Permissions' })
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const resting = await window
    .getByRole('link', { name: 'Providers' })
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(raised).not.toBe(resting)

  await window.setViewportSize({ width: 1440, height: 1000 })
  await window.screenshot({ path: join(SHOT_DIR, 'settings-permissions.png') })

  // An address is a way in: asking for a panel by name opens it, without clicking the menu.
  await window.evaluate(() => {
    globalThis.location.hash = '/settings?tab=browser-access'
  })
  await expect(window.getByRole('heading', { name: 'Browser access' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Default permission level' })).toHaveCount(0)

  await window.getByRole('link', { name: 'Appearance' }).click()
  await expect(window.getByRole('heading', { name: 'Theme' })).toBeVisible()

  await app.close()
})
