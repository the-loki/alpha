import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

/** The tool-calling turn: a read that works, then a shell command that fails. */
const SCRIPT = [
  { tool: { name: 'read', args: { path: 'notes.txt' } } },
  { text: 'It says hello from the ledger.', tool: { name: 'bash', args: { command: 'cat missing.txt' } } },
  'The second one failed; the file does not exist.',
]

/** A workspace with one file, and a window pointed at it. */
async function launch(options: { dataDirectory?: string; workspace?: string } = {}) {
  const dataDirectory = options.dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  if (options.workspace === undefined) writeFileSync(join(workspace, 'notes.txt'), 'hello from the ledger')
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      permissionLevel: 'ask',
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
      ALPHA_FAUX_REPLIES: JSON.stringify(SCRIPT),
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

const row = (window: Page, name: string) =>
  window.getByRole('main').locator('article').filter({ hasText: name }).first()

test('a tool call becomes a ledger row in the transcript', async () => {
  const { app, window } = await launch()

  await ask(window, 'check the notes file')

  // The read ran, and its row says what it read and that it worked.
  const read = row(window, 'read')
  await expect(read).toBeVisible({ timeout: 20_000 })
  await expect(read).toContainText('notes.txt')
  await expect(read).toContainText('done')

  // Then the failing shell command: a row that says so, with what the tool printed.
  const bash = row(window, 'bash')
  await expect(bash).toBeVisible({ timeout: 20_000 })
  await expect(bash).toContainText('cat missing.txt')
  await expect(bash).toContainText('failed')

  await expect(window.getByText('The second one failed; the file does not exist.')).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'ledger-rows.png') })

  // A failed row is opened by default, so the audit trail is visible without a click.
  await expect(bash).toContainText('Output')
  await expect(bash).toContainText('No such file')

  await app.close()
})

test('the ledger rows of a past conversation come back the same', async () => {
  const first = await launch()
  await ask(first.window, 'check the notes file')
  await expect(row(first.window, 'bash')).toContainText('failed', { timeout: 20_000 })
  await first.app.close()

  const second = await launch({ dataDirectory: first.dataDirectory, workspace: first.workspace })
  const listed = second.window.getByRole('button', { name: /check the notes file/ })
  await listed.click()

  const read = row(second.window, 'read')
  await expect(read).toBeVisible()
  await expect(read).toContainText('notes.txt')
  await expect(read).toContainText('done')
  const bash = row(second.window, 'bash')
  await expect(bash).toContainText('failed')
  await expect(bash).toContainText('No such file')
  await second.window.screenshot({ path: join(SHOT_DIR, 'ledger-restored.png') })
  await second.app.close()
})
