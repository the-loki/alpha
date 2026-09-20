import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { configureProvider, scriptedAgent } from './agent'

/**
 * Putting a conversation away and taking it back out (tickets #79 and #80): the row's `⋯` holds
 * the actions, the archived section is where they land, and a message is what brings one back.
 */
const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

async function launch(options: { status?: 'idle' | 'waiting' } = {}) {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      ...scriptedAgent,
      language: 'en',
      permissionLevel: 'ask',
    }),
    'utf-8',
  )

  writeFileSync(
    join(dataDirectory, 'conversations.json'),
    JSON.stringify({
      version: 1,
      conversations: [
        {
          id: 'seed-1',
          workspacePath: workspace,
          title: 'rename the parser module',
          createdAt: Date.now() - 120_000,
          updatedAt: Date.now() - 60_000,
          status: options.status ?? 'idle',
          permissionLevel: 'ask',
          model: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
          thinkingLevel: 'medium',
        },
      ],
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
      ALPHA_FAUX_REPLIES: JSON.stringify(['The answer.']),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window, dataDirectory }
}

const row = (window: Page) => window.getByRole('button', { name: /rename the parser module/ }).first()

async function openRowMenu(window: Page) {
  await row(window).hover()
  await window.getByRole('button', { name: 'Actions for rename the parser module' }).click()
}

test('a conversation is archived from the row and comes back when a message is sent', async () => {
  const { app, window, dataDirectory } = await launch()

  // At rest the row is the name: the actions are not painted over it.
  await expect(window.getByRole('button', { name: 'Archive' })).toHaveCount(0)

  await openRowMenu(window)
  await window.screenshot({ path: join(SHOT_DIR, 'archive-menu.png') })
  await window.getByRole('menuitem', { name: 'Archive' }).click()

  // Out of the folder, into the archived section.
  await expect(row(window)).toHaveCount(0)
  const archived = window.getByRole('button', { name: 'Expand the archived conversations' })
  await expect(archived).toBeVisible()
  await archived.click()
  await expect(window.getByRole('button', { name: /rename the parser module/ }).first()).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'archive-section.png') })

  // The file says so too: archiving is a fact about the index, not a way of drawing it.
  const index = JSON.parse(readFileSync(join(dataDirectory, 'conversations.json'), 'utf-8'))
  expect(index.conversations[0].archivedAt).toBeGreaterThan(0)

  // A message is what brings it back: sending one unarchives and puts it in the folder again. The
  // header is the proof the conversation is the open one, so the message is not sent into a new one.
  await window
    .getByRole('button', { name: /rename the parser module/ })
    .first()
    .click()
  await expect(window.getByRole('heading', { name: 'rename the parser module' })).toBeVisible()

  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill('one more thing')
  await composer.press('Enter')

  await expect(window.getByRole('button', { name: 'Expand the archived conversations' })).toHaveCount(0)
  const after = JSON.parse(readFileSync(join(dataDirectory, 'conversations.json'), 'utf-8'))
  expect(after.conversations[0].archivedAt).toBeUndefined()

  await app.close()
})

test('a conversation that is waiting on an answer is not offered for archiving', async () => {
  const { app, window } = await launch({ status: 'waiting' })

  await openRowMenu(window)
  await expect(window.getByRole('menuitem', { name: /Archive/ })).toBeDisabled()
  await expect(window.getByText('Stop it first')).toBeVisible()

  await app.close()
})
