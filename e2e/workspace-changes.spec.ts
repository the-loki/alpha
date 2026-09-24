import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import { ask, launchWorkbench } from './agent'
import { closeScriptedProviders } from './scripted-provider'

test.afterEach(() => closeScriptedProviders())

async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

test('reviews actual workspace changes after a run and after reopening', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-review-ws-'))
  writeFileSync(join(workspace, 'edited.txt'), 'before\n')
  writeFileSync(join(workspace, 'deleted.txt'), 'gone\n')
  const { app, window, dataDirectory } = await launchWorkbench({
    workspace,
    level: 'full-access',
    replies: [
      { tool: { name: 'write', args: { path: 'added.txt', content: 'new\n' } } },
      { tool: { name: 'bash', args: { command: "printf 'after\\n' > edited.txt && rm deleted.txt" } } },
      'Done.',
    ],
  })

  await ask(window, 'make the requested changes')
  await expect(window.getByRole('main').getByText('Done.')).toBeVisible({ timeout: 20_000 })
  await window.getByRole('tab', { name: /^Changes/ }).click()
  const review = window.getByRole('tabpanel', { name: 'Changes' })
  await expect(review.locator('[data-change-kind]')).toHaveCount(3)
  await expect(review.locator('[data-change-kind="added"]')).toContainText('added.txt')
  await expect(review.locator('[data-change-kind="modified"]')).toContainText('edited.txt')
  await expect(review.locator('[data-change-kind="deleted"]')).toContainText('deleted.txt')
  await review.getByText('edited.txt').click()
  await expect(review.getByText('before', { exact: true })).toBeVisible()
  await expect(review.getByText('after', { exact: true })).toBeVisible()
  await window.getByRole('tab', { name: 'Changes' }).focus()
  await window.keyboard.press('ArrowLeft')
  await expect(window.getByRole('tab', { name: 'Conversation' })).toHaveAttribute('aria-selected', 'true')
  await window.keyboard.press('ArrowRight')
  await expect(window.getByRole('tab', { name: 'Changes' })).toHaveAttribute('aria-selected', 'true')
  await window.screenshot({ path: join(process.cwd(), 'test-results', 'workspace-changes-desktop.png') })
  await app.close()

  const reopened = await launchWorkbench({ dataDirectory, workspace, provider: false, keepState: true })
  await reopened.window.getByRole('tab', { name: /^Changes/ }).click()
  await expect(reopened.window.getByRole('tabpanel', { name: 'Changes' }).locator('[data-change-kind]')).toHaveCount(3)
  await reopened.app.close()
})

test('a narrow browser can review binary changes and incomplete coverage', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-review-browser-'))
  mkdirSync(join(workspace, 'node_modules'))
  const port = await freePort()
  const token = 'workspace-review-test-token'
  const { app, window } = await launchWorkbench({
    workspace,
    level: 'full-access',
    network: { port, token },
    replies: [{ tool: { name: 'bash', args: { command: "printf '\\000\\001' > image.bin" } } }, 'Done.'],
  })
  const browser = await chromium.launch()

  try {
    await ask(window, 'create the binary file')
    await expect(window.getByRole('main').getByText('Done.')).toBeVisible({ timeout: 20_000 })

    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(`http://127.0.0.1:${port}`)
    await page.getByLabel('Access token').fill(token)
    await page.getByRole('button', { name: 'Open the workbench' }).click()
    await page.getByRole('tab', { name: 'Changes' }).click()
    const review = page.getByRole('tabpanel', { name: 'Changes' })
    await expect(review.getByText('image.bin')).toBeVisible()
    await expect(review.getByText('Some paths were not scanned. This list may be incomplete.')).toBeVisible()
    await review.getByText('image.bin').click()
    await expect(review.getByText('Preview unavailable')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
      0,
    )
    await page.screenshot({ path: join(process.cwd(), 'test-results', 'workspace-changes-mobile.png') })
  } finally {
    await browser.close()
    await app.close()
  }
})
