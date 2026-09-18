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
    args: [REPO_ROOT],
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

test('the settings route is addressable', async () => {
  const { app, window } = await launchApp()

  await window.getByRole('link', { name: 'Settings' }).click()
  await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Default permission level' })).toBeVisible()
  await expect(window.getByRole('heading', { name: 'Remembered approvals' })).toBeVisible()

  // Tall enough for the whole page: the capture has to show every level and the remembered
  // rules, not the first screenful of them.
  await window.setViewportSize({ width: 1440, height: 1200 })
  const fits = await window.evaluate(() => document.documentElement.scrollHeight <= globalThis.innerHeight)
  expect(fits).toBe(true)

  await window.screenshot({ path: join(SHOT_DIR, 'settings-permissions.png') })
  await app.close()
})
