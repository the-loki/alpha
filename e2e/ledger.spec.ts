import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { configureProvider, scriptedAgent } from './agent'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

/** The tool-calling turn: a read that works, an edit that changes the file, then a command that fails. */
const SCRIPT = [
  { tool: { name: 'read', args: { path: 'notes.txt' } } },
  {
    text: 'It says hello from the ledger.',
    tool: { name: 'edit', args: { path: 'notes.txt', edits: [{ oldText: 'hello', newText: 'goodbye' }] } },
  },
  { tool: { name: 'bash', args: { command: 'cat missing.txt' } } },
  'The last one failed; the file does not exist.',
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
      // Full access on purpose: this spec is about the ledger, not the gate, so no card intervenes.
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
      ALPHA_FAUX_REPLIES: JSON.stringify(SCRIPT),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window, dataDirectory, workspace }
}

/** Two painted frames: the window is at rest before anything is captured. */
async function settle(window: Page) {
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function ask(window: Page, text: string) {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}

/** The ledger row for one tool, which the transcript shows instead of prose. */
const row = (window: Page, name: string) =>
  window.getByRole('main').locator(`[data-role="tool"][data-tool="${name}"]`).first()

test('a tool call becomes a ledger row in the transcript', async () => {
  const { app, window } = await launch()

  await ask(window, 'check the notes file')

  // The read ran, and its row says what it read and that it worked.
  const read = row(window, 'read')
  await expect(read).toBeVisible({ timeout: 20_000 })
  await expect(read).toContainText('notes.txt')
  await expect(read).toContainText('done')

  // Then the file the agent changed: the row carries the diff, not just a note that it wrote.
  const edit = row(window, 'edit')
  await expect(edit).toBeVisible({ timeout: 20_000 })
  await expect(edit).toContainText('notes.txt')
  await expect(edit).toContainText('done')
  await edit.locator('button').first().click()
  await expect(edit).toContainText('hello from the ledger')
  await expect(edit).toContainText('goodbye from the ledger')

  // Then the failing shell command: a row that says so, with what the tool printed.
  const bash = row(window, 'bash')
  await expect(bash).toBeVisible({ timeout: 20_000 })
  await expect(bash).toContainText('cat missing.txt')
  await expect(bash).toContainText('failed')

  await expect(window.getByText('The last one failed; the file does not exist.')).toBeVisible()
  await settle(window)
  await window.screenshot({ path: join(SHOT_DIR, 'ledger-rows.png') })

  // A failed row is opened by default, so the audit trail is visible without a click.
  await expect(bash).toContainText('Output')
  await expect(bash).toContainText('No such file')

  // Rows that are open make the transcript taller than the pane. It scrolls, and it stays inside
  // the pane: a transcript that grows past the composer is a transcript you cannot read.
  const geometry = await window.evaluate(() => {
    const box = (el: Element) => {
      const rect = el.getBoundingClientRect()
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) }
    }
    const last = [...document.querySelectorAll('[data-role]')].at(-1)
    let node: Element | null = last?.parentElement ?? null
    let scroller: Element | null = null
    while (node !== null && scroller === null) {
      if (['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) scroller = node
      node = node.parentElement
    }
    const field = document.querySelector('textarea')
    return {
      scrollable: scroller !== null && scroller.scrollHeight > scroller.clientHeight,
      transcriptBottom: scroller === null ? 0 : box(scroller).bottom,
      composerTop: field === null ? 0 : box(field).top,
    }
  })
  expect(geometry.scrollable).toBe(true)
  expect(geometry.transcriptBottom).toBeLessThanOrEqual(geometry.composerTop)

  // Scrolling to the end is what puts the last row on screen, and it lands above the composer.
  const lastRowBottom = await window.evaluate(() => {
    const scroller = [...document.querySelectorAll('main *')].find((el) => getComputedStyle(el).overflowY === 'auto')
    if (scroller === undefined || scroller === null) return 0
    scroller.scrollTop = scroller.scrollHeight
    const last = [...scroller.querySelectorAll('[data-role]')].at(-1)
    return last === undefined ? 0 : Math.round(last.getBoundingClientRect().bottom)
  })
  expect(lastRowBottom).toBeLessThanOrEqual(geometry.composerTop)

  await app.close()
})

test('the ledger rows of a past conversation come back the same', async () => {
  const first = await launch()
  await ask(first.window, 'check the notes file')
  await expect(row(first.window, 'bash')).toContainText('failed', { timeout: 20_000 })
  await first.app.close()

  const second = await launch({ dataDirectory: first.dataDirectory, workspace: first.workspace })
  const listed = second.window.getByRole('button', { name: /^check the notes file (idle|working)$/ })
  await listed.click()

  const read = row(second.window, 'read')
  await expect(read).toBeVisible()
  await expect(read).toContainText('notes.txt')
  await expect(read).toContainText('done')
  const bash = row(second.window, 'bash')
  await expect(bash).toContainText('failed')
  await expect(bash).toContainText('No such file')
  // The diff survives the relaunch too: it is part of what the session recorded.
  const edit = row(second.window, 'edit')
  await edit.locator('button').first().click()
  await expect(edit).toContainText('goodbye from the ledger')
  await settle(second.window)
  await second.window.screenshot({ path: join(SHOT_DIR, 'ledger-restored.png') })
  await second.app.close()
})
