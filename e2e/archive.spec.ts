import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { launchWorkbench } from './agent'
import { closeScriptedProviders } from './scripted-provider'

/**
 * Putting a conversation away and taking it back out (tickets #79 and #80): the row's `⋯` holds
 * the actions, the archived section is where they land, and a message is what brings one back.
 */
const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

test.afterEach(() => closeScriptedProviders())

async function launch(options: { status?: 'idle' | 'waiting' } = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  const { app, window, dataDirectory } = await launchWorkbench({
    workspace,
    level: 'ask',
    replies: ['The answer.'],
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
  })
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
