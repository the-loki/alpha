import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

const WRITE = { tool: { name: 'write', args: { path: 'made.txt', content: 'written by the agent' } } }

/** A window pointed at a fresh workspace, with the model scripted to ask for a file write. */
async function launch(
  options: { level?: string; dataDirectory?: string; workspace?: string; replies?: unknown[] } = {},
) {
  const dataDirectory = options.dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      permissionLevel: options.level ?? 'ask',
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
      ALPHA_FAUX_REPLIES: JSON.stringify(options.replies ?? [WRITE, 'Done.']),
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

const card = (window: Page) => window.getByRole('region', { name: 'Waiting for your decision' })

/** The ledger row for a call to one tool, which is what the transcript shows instead of prose. */
const row = (window: Page, tool: string) => window.getByRole('main').locator(`[data-role="tool"][data-tool="${tool}"]`)

test('in plan a write is blocked with no card, and the agent is told why', async () => {
  const { app, window, workspace } = await launch({ level: 'plan' })

  await ask(window, 'write the file')

  await expect(row(window, 'write')).toContainText('blocked', { timeout: 20_000 })
  await expect(row(window, 'write')).toContainText('failed')
  await expect(window.getByRole('button', { name: 'Plan' })).toBeVisible()
  await expect(card(window)).toHaveCount(0)
  expect(exists(join(workspace, 'made.txt'))).toBe(false)

  await app.close()
})

test('in ask the card shows the change, and Allow once runs it', async () => {
  const { app, window, workspace } = await launch()

  await ask(window, 'write the file')

  await expect(card(window)).toBeVisible({ timeout: 20_000 })
  await expect(card(window)).toContainText('made.txt')
  await expect(card(window)).toContainText('+written by the agent')
  await expect(card(window)).toContainText(workspace)
  await window.screenshot({ path: join(SHOT_DIR, 'gate-card.png') })

  await window.getByRole('button', { name: 'Allow once' }).click()

  await expect(card(window)).toHaveCount(0)
  await expect(row(window, 'write')).toContainText('allowed once')
  await expect.poll(() => exists(join(workspace, 'made.txt'))).toBe(true)
  // Answering hands the keyboard back, so the next thing typed is the next message.
  await expect(window.getByRole('textbox', { name: 'Message the agent' })).toBeFocused()

  await app.close()
})

test('the row still says who allowed it after a relaunch', async () => {
  const first = await launch()
  await ask(first.window, 'write the file')
  await expect(card(first.window)).toBeVisible({ timeout: 20_000 })
  await first.window.getByRole('button', { name: 'Allow once' }).click()
  await expect(row(first.window, 'write')).toContainText('allowed once', { timeout: 20_000 })
  await first.app.close()

  // The decision is Alpha's, not the session's, so the ledger has to bring it back itself.
  const second = await launch({ dataDirectory: first.dataDirectory, workspace: first.workspace })
  const listed = second.window.getByRole('button', { name: /^write the file (idle|working)$/ })
  await listed.click()
  const restored = row(second.window, 'write')
  await expect(restored).toContainText('made.txt')
  await restored.locator('button').first().click()
  await expect(restored).toContainText('Allowed once by you, at the Ask level.')
  await second.app.close()
})

test('denying returns the reason to the agent and runs nothing', async () => {
  const { app, window, workspace } = await launch()

  await ask(window, 'write the file')
  await expect(card(window)).toBeVisible({ timeout: 20_000 })

  await window.getByRole('textbox', { name: 'Reason for denying' }).fill('that file is generated')
  await window.getByRole('button', { name: 'Deny' }).click()

  await expect(row(window, 'write')).toContainText('denied')
  await expect(row(window, 'write')).toContainText('failed')
  await expect(row(window, 'write')).toContainText('that file is generated')
  expect(exists(join(workspace, 'made.txt'))).toBe(false)

  await app.close()
})

test('the card takes the keyboard: Enter allows once, Escape denies', async () => {
  const entered = await launch()
  await ask(entered.window, 'write the file')
  await expect(card(entered.window)).toBeVisible({ timeout: 20_000 })
  await entered.window.keyboard.press('Enter')
  await expect(card(entered.window)).toHaveCount(0)
  await expect.poll(() => exists(join(entered.workspace, 'made.txt'))).toBe(true)
  await entered.app.close()

  const escaped = await launch()
  await ask(escaped.window, 'write the file')
  await expect(card(escaped.window)).toBeVisible({ timeout: 20_000 })
  await escaped.window.keyboard.press('Escape')
  await expect(card(escaped.window)).toHaveCount(0)
  expect(exists(join(escaped.workspace, 'made.txt'))).toBe(false)
  await escaped.app.close()
})

test('Always allow remembers a workspace rule, which settings can revoke', async () => {
  const { app, window, workspace } = await launch({
    replies: [WRITE, { tool: { name: 'write', args: { path: 'made.txt', content: 'again' } } }, 'Done.'],
  })

  await ask(window, 'write the file')
  await expect(card(window)).toBeVisible({ timeout: 20_000 })
  await window.getByRole('combobox', { name: 'Remember this for' }).selectOption('workspace')
  await window.getByRole('button', { name: 'Always allow' }).click()

  // The second call is covered by the rule, so it runs with no card at all.
  await expect(card(window)).toHaveCount(0)
  await expect.poll(() => readFileSync(join(workspace, 'made.txt'), 'utf8')).toBe('again')

  await window.getByRole('link', { name: 'Settings' }).click()
  await window.getByRole('link', { name: 'Permissions' }).click()
  const rule = window.getByRole('listitem').filter({ hasText: 'made.txt' })
  await expect(rule).toContainText('write')
  await expect(rule).toContainText('This workspace')

  await window.getByRole('button', { name: /Revoke the write rule/ }).click()
  await expect(window.getByText(/Nothing is remembered yet/)).toBeVisible()

  await app.close()
})

const exists = (path: string): boolean => {
  try {
    return readFileSync(path, 'utf8') !== ''
  } catch {
    return false
  }
}
