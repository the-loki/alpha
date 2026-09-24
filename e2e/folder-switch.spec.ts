/**
 * Which folder a new conversation starts in, chosen on the composer itself. The welcome page is
 * where a person is about to open a conversation, and "in which folder" is the decision being made
 * there — so the line above the box is a control, not a label. The rail can be folded and a phone
 * has no room for it; this is the one place the choice is always at hand.
 *
 * The second case is a browser client, which has no folder picker at all: the folders the workbench
 * remembers are still switchable there, and what a browser cannot do it says instead of hiding.
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Browser, chromium, expect, type Page, test } from '@playwright/test'
import { ask, launchWorkbench } from './agent'
import { closeScriptedProviders } from './scripted-provider'

test.afterEach(() => closeScriptedProviders())

/** The folders the workbench has written down a conversation in, read from its own file. */
function conversationFolders(dataDirectory: string): string[] {
  try {
    const index = JSON.parse(readFileSync(join(dataDirectory, 'conversations.json'), 'utf-8')) as {
      conversations: { workspacePath: string }[]
    }
    return index.conversations.map((conversation) => conversation.workspacePath)
  } catch {
    // No index file at all: no conversation has been started yet, which is a state and not a failure.
    return []
  }
}

/** The line above the box, named by what it does rather than by the folder it currently holds. */
function folderOf(window: Page, folder: string) {
  return window.getByRole('button', { name: `Change the folder: ${folder}` })
}

/**
 * A folder to switch to, and the name the workbench will call it by: a folder remembers its own path
 * and takes its name from the last segment of it, so a recent written with some other name wears the
 * path's name as soon as it is selected.
 */
function otherFolder(): { path: string; name: string } {
  const path = mkdtempSync(join(tmpdir(), 'alpha-e2e-elsewhere-'))
  return { path, name: path.slice(path.lastIndexOf('/') + 1) }
}

test('starts the next conversation in another folder, chosen from the composer itself', async () => {
  const elsewhere = otherFolder()
  // A provider, because the last step sends a message: a workbench with no model refuses one before
  // it ever reaches the folder the conversation would have been started in.
  const { app, window, dataDirectory } = await launchWorkbench({
    resize: false,
    replies: ['Noted.'],
    recents: [{ path: elsewhere.path, name: elsewhere.name, lastOpenedAt: Date.now() - 1000 }],
  })

  // The welcome page says which folder the message is written in, and that line opens a menu.
  await expect(folderOf(window, 'sandbox')).toBeVisible()
  await folderOf(window, 'sandbox').click()
  const menu = window.getByRole('menu', { name: 'Folders' })
  await expect(menu.getByText('Folders', { exact: true })).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: 'sandbox' })).toHaveAttribute('aria-checked', 'true')

  await menu.getByRole('menuitemradio', { name: elsewhere.name }).click()
  await expect(folderOf(window, elsewhere.name)).toBeVisible()

  // And the conversation the message starts is in the folder that was chosen, not the one the box was
  // pointed at before — said twice: the rail draws the row under that folder, and the index file
  // agrees, so this is not a claim about one of the two.
  await ask(window, 'hello there')
  await expect(
    // The row itself, not the `⋯` that acts on it: both carry the title.
    window
      .locator(`[data-workspace="${elsewhere.path}"]`)
      .getByRole('button', { name: /hello there/ })
      .first(),
  ).toBeVisible()
  await expect.poll(() => conversationFolders(dataDirectory)).toEqual([elsewhere.path])
  await app.close()
})

test('offers the remembered folders in a browser, and says what it cannot do there', async () => {
  const elsewhere = otherFolder()
  const browser: Browser = await chromium.launch()
  const { app, window } = await launchWorkbench({
    provider: false,
    resize: false,
    network: { port: 4321, token: 'the-token-a-person-would-paste' },
    recents: [{ path: elsewhere.path, name: elsewhere.name, lastOpenedAt: Date.now() - 1000 }],
  })

  // The token is shown in Settings on the desktop client; the browser is the second client.
  await window.getByRole('link', { name: 'Settings' }).click()
  const page = await browser.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:4321')
  await page.getByLabel('Access token').fill('the-token-a-person-would-paste')
  await page.getByRole('button', { name: 'Open the workbench' }).click()

  await expect(folderOf(page, 'sandbox')).toBeVisible()
  await folderOf(page, 'sandbox').click()
  const menu = page.getByRole('menu', { name: 'Folders' })
  await expect(menu.getByRole('menuitemradio', { name: elsewhere.name })).toBeVisible()
  // No picker to offer, so the row that would open one is a sentence rather than nothing.
  await expect(menu.getByText('A folder can only be added in the desktop window.')).toBeVisible()

  await menu.getByRole('menuitemradio', { name: elsewhere.name }).click()
  await expect(folderOf(page, elsewhere.name)).toBeVisible()
  await page.close()
  await browser.close()
  await app.close()
})
