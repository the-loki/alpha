import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { ask, launchWorkbench } from './agent'
import { closeScriptedProviders } from './scripted-provider'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

test.afterEach(() => closeScriptedProviders())

/** A window on a chosen workspace, sharing a data directory when the test wants continuity. */
async function launch(options: { dataDirectory?: string; workspace?: string; keepState?: boolean } = {}) {
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  return launchWorkbench({
    dataDirectory: options.dataDirectory,
    workspace,
    workspaceName: workspace.split('/').pop(),
    level: 'full-access',
    replies: ['The answer.'],
    // keepState reuses the state file the previous launch left behind, memory included.
    keepState: options.keepState === true,
  })
}

const sessionsHaveTranscripts = (dataDirectory: string): boolean => {
  const root = join(dataDirectory, 'sessions')
  if (!existsSync(root)) return false
  return readdirSync(root, { recursive: true }).some((entry) => String(entry).endsWith('.jsonl'))
}

test('the sidebar shows every folder it has worked in, each with its own conversations', async () => {
  const first = await launch()
  await ask(first.window, 'a question in the first folder')
  await expect(first.window.getByRole('main').getByText('The answer.')).toBeVisible({ timeout: 20_000 })
  await first.app.close()

  const second = await launch({ dataDirectory: first.dataDirectory })
  await ask(second.window, 'a question in the second folder')
  await expect(second.window.getByRole('main').getByText('The answer.')).toBeVisible({ timeout: 20_000 })

  // The second window remembers only its own folder, and the first one is still on screen with
  // what was asked in it: a folder the workbench stopped remembering does not take its
  // conversations away with it.
  const sidebar = second.window.getByRole('complementary')
  const ours = sidebar.locator(`[data-workspace="${first.workspace}"]`)
  await expect(ours).toContainText('a question in the first folder')
  await expect(ours.getByTitle('1 conversation')).toBeVisible()
  const here = sidebar.locator(`[data-workspace="${second.workspace}"]`)
  await expect(here).toContainText('a question in the second folder')
  // Neither folder is "the open one": both are on screen, each with a way to start another.
  await expect(ours.getByRole('button', { name: /^Start a conversation in / })).toHaveCount(1)
  await expect(here.getByRole('button', { name: /^Start a conversation in / })).toHaveCount(1)
  await second.window.screenshot({ path: join(SHOT_DIR, 'sidebar-grouped.png') })
  await second.app.close()
})

test('a renamed conversation keeps its name across a relaunch', async () => {
  const first = await launch()
  await ask(first.window, 'rename me')
  await expect(first.window.getByRole('main').getByText('The answer.')).toBeVisible({ timeout: 20_000 })

  // Renaming lives behind the row's menu since #80: one `⋯` instead of words painted over the name.
  await first.window.getByRole('button', { name: /^rename me/ }).hover()
  await first.window.getByRole('button', { name: 'Actions for rename me' }).click()
  await first.window.getByRole('menuitem', { name: 'Rename' }).click()
  const field = first.window.getByRole('textbox', { name: 'Conversation title' })
  await field.fill('The parser rewrite')
  await field.press('Enter')

  const renamed = first.window.getByRole('button', { name: 'The parser rewrite idle' })
  await expect(renamed).toBeVisible()
  await expect(first.window.getByRole('heading', { name: 'The parser rewrite' })).toBeVisible()
  await first.app.close()

  const second = await launch({ dataDirectory: first.dataDirectory, workspace: first.workspace })
  await expect(second.window.getByRole('button', { name: 'The parser rewrite idle' })).toBeVisible()
  await second.app.close()
})

test('the header names the conversation the sidebar names', async () => {
  const { app, window } = await launch()
  await ask(window, 'rename the parser module')
  await expect(window.getByRole('main').getByText('The answer.')).toBeVisible({ timeout: 20_000 })

  // The first message names the conversation: the pane and the sidebar must agree on the name,
  // rather than the pane keeping the folder name it opened with.
  await expect(window.getByRole('main').getByRole('heading')).toContainText('rename the parser module')
  await expect(
    window.getByRole('complementary').getByRole('button', { name: /^rename the parser module/ }),
  ).toBeVisible()
  await app.close()
})

test('a relaunch comes back to the conversation that was open', async () => {
  const first = await launch()
  await ask(first.window, 'what did we decide')
  await expect(first.window.getByRole('main').getByText('The answer.')).toBeVisible({ timeout: 20_000 })
  await first.app.close()

  const second = await launch({ dataDirectory: first.dataDirectory, workspace: first.workspace, keepState: true })
  // Nothing is clicked: the transcript is read back from the session file on its own.
  const main = second.window.getByRole('main')
  await expect(main.locator('[data-role="user"]')).toContainText('what did we decide', { timeout: 20_000 })
  await expect(main.locator('[data-role="assistant"]')).toContainText('The answer.')
  await second.app.close()
})

test('deleting a conversation takes its transcript off the disk', async () => {
  const { app, window, dataDirectory } = await launch()
  await ask(window, 'this will be deleted')
  await expect(window.getByRole('main').getByText('The answer.')).toBeVisible({ timeout: 20_000 })
  expect(sessionsHaveTranscripts(dataDirectory)).toBe(true)

  await window
    .getByRole('button', { name: /this will be deleted/ })
    .first()
    .hover()
  await window.getByRole('button', { name: 'Actions for this will be deleted' }).click()
  await window.getByRole('menuitem', { name: 'Delete' }).click()

  await expect(window.getByRole('button', { name: /this will be deleted/ })).toHaveCount(0)
  // The folder stays where it was in the sidebar — it is still a folder the workbench works in —
  // and says it holds nothing.
  await expect(window.getByRole('complementary').getByText('No conversations yet')).toBeVisible()
  expect(sessionsHaveTranscripts(dataDirectory)).toBe(false)

  await app.close()
})

test('exporting writes a markdown file beside the workspace', async () => {
  const { app, window, workspace } = await launch()
  await ask(window, 'what is the answer')
  await expect(window.getByRole('main').getByText('The answer.')).toBeVisible({ timeout: 20_000 })

  // Export is done to a conversation, so it lives on the conversation's own row (C5.4).
  await window
    .getByRole('button', { name: /what is the answer/ })
    .first()
    .hover()
  await window.getByRole('button', { name: 'Actions for what is the answer' }).click()
  await window.getByRole('menuitem', { name: 'Export' }).click()

  await expect(window.getByText(/Exported to/)).toBeVisible()
  const path = join(workspace, 'what-is-the-answer.md')
  await expect.poll(() => existsSync(path)).toBe(true)
  const markdown = readFileSync(path, 'utf8')
  expect(markdown).toContain('# what is the answer')
  expect(markdown).toContain('The answer.')
  await app.close()
})

test('the header says what the session spent, on the title and nowhere else', async () => {
  const { app, window } = await launch()
  await ask(window, 'spend some tokens')
  await expect(window.getByRole('main').getByText('The answer.')).toBeVisible({ timeout: 20_000 })

  // What the session cost is one tooltip on the view head's title (C5.4): the transcript carries
  // no tail lines under its messages, a single message shows no cost, and the scripted model's
  // zero cost data means no figure is written — a made-up number would be worse than none.
  await expect(window.getByRole('heading', { level: 1 })).toHaveAttribute('title', /Tokens for this conversation/)
  await expect(window.getByText(/Turn ·/)).toHaveCount(0)
  await expect(window.getByText(/\$\d/)).toHaveCount(0)
  await window.screenshot({ path: join(SHOT_DIR, 'usage-header.png') })
  await app.close()
})
