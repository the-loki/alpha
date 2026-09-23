import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { ask, launchWorkbench, sizeWindow } from './agent'
import { closeScriptedProviders } from './scripted-provider'

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

test.afterEach(() => closeScriptedProviders())

/** A workspace with one file, and a window pointed at it. */
async function launch(options: { dataDirectory?: string; workspace?: string } = {}) {
  // A workspace handed in is reused as it stands; one made here gets the note the ledger reads.
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  if (options.workspace === undefined) writeFileSync(join(workspace, 'notes.txt'), 'hello from the ledger')
  // Full access on purpose: this spec is about the ledger, not the gate, so no card intervenes.
  return launchWorkbench({
    dataDirectory: options.dataDirectory,
    workspace,
    level: 'full-access',
    replies: SCRIPT,
  })
}

/** Two painted frames: the window is at rest before anything is captured. */
async function settle(window: Page) {
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
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

  // Rows that are open make the transcript taller than the pane, so it scrolls. The bar the next
  // message is written in is docked at the foot of that same scroll, so what has to hold is not
  // that the scroll stops above the bar — it does not, the transcript passes behind it — but that
  // the rows come to rest clear of it, which is what the read at the end of this test measures. The
  // pane is shrunk first, so the "taller than the pane" part is a fact the test sets up rather than
  // a fact about how much chrome the window happens to spend above the page.
  await sizeWindow(app, window, 1440, 520)
  const geometry = await window.evaluate(() => {
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
      composerTop: field === null ? 0 : Math.round(field.getBoundingClientRect().top),
    }
  })
  expect(geometry.scrollable).toBe(true)

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
