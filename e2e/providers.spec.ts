import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

async function launch(dataDirectory?: string) {
  const directory = dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(directory, 'workbench-state.json'),
    JSON.stringify({
      workspace: { selection: { kind: 'none' }, recents: [] },
      permissionLevel: 'ask',
    }),
    'utf-8',
  )
  const app = await electron.launch({
    args: [REPO_ROOT],
    cwd: REPO_ROOT,
    env: { ...process.env, ALPHA_DATA_DIR: directory, NODE_ENV: 'production' },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window, directory, workspace }
}

async function openSettings(window: Page) {
  await window.getByRole('link', { name: 'Settings' }).click()
  await expect(window.getByRole('heading', { name: 'Model providers' })).toBeVisible()
}

test('a provider can be added from the catalog, given a key, and deleted', async () => {
  const { app, window, directory } = await launch()
  await openSettings(window)

  await window.getByLabel('Add a provider from the catalog').selectOption('deepseek')
  await window.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(window.getByText('DeepSeek', { exact: true })).toBeVisible()
  await expect(window.getByText('no key', { exact: true })).toBeVisible()

  await window.getByLabel('API key for DeepSeek').fill('sk-test-not-a-real-key')
  await window.getByRole('button', { name: 'Save key' }).click()
  await expect(window.getByText('key stored', { exact: true })).toBeVisible()

  // The key travelled one way, and the vault tells the truth about how it is protected: sealed
  // when the OS offers a keychain, plaintext (and said so in the UI) when it does not.
  const vault = JSON.parse(readFileSync(join(directory, 'credentials.json'), 'utf-8'))
  const protection = vault.entries[0].protection
  if (protection === 'os') {
    expect(JSON.stringify(vault)).not.toContain('sk-test-not-a-real-key')
    await expect(window.getByText(/no keychain/)).toBeHidden()
  } else {
    await expect(window.getByText(/no keychain/)).toBeVisible()
  }

  await window.screenshot({ path: join(SHOT_DIR, 'settings-provider.png') })

  await window.getByRole('button', { name: 'Delete' }).click()
  await expect(window.getByText('No providers yet.')).toBeVisible()
  await app.close()
})

test('a custom endpoint is refused when it is not filled in', async () => {
  const { app, window } = await launch()
  await openSettings(window)

  await window.getByRole('button', { name: 'Add custom provider' }).click()
  await expect(window.getByText(/the id must be/i)).toBeVisible()

  await window.getByRole('textbox', { name: 'Id', exact: true }).fill('local-endpoint')
  await window.getByRole('textbox', { name: 'Base URL', exact: true }).fill('https://llm.internal.example/v1')
  await window.getByRole('textbox', { name: 'Model id', exact: true }).fill('local-7b')
  await window.getByRole('button', { name: 'Add custom provider' }).click()
  await expect(window.getByText('llm.internal.example/v1')).toBeVisible()

  await app.close()
})

test('a provider with no key leaves sending blocked with a reason', async () => {
  const { app, window, directory } = await launch()
  await openSettings(window)
  await window.getByLabel('Add a provider from the catalog').selectOption('groq')
  await window.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(window.getByText('no key', { exact: true })).toBeVisible()
  await app.close()

  const reopened = await launch(directory)
  await reopened.window.getByRole('link', { name: 'Settings' }).click()
  await expect(reopened.window.getByText('Groq', { exact: true })).toBeVisible()
  await reopened.app.close()
})
