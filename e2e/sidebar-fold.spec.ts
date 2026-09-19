import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * A long list in the rail shows a screenful and offers the rest (ticket #86): the palette is the
 * list you find things in, so a folder that folds is not a folder that hides.
 */
const REPO_ROOT = process.cwd()

test('a folder with more conversations than fit says how many more there are', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      language: 'en',
      permissionLevel: 'ask',
    }),
    'utf-8',
  )

  const conversations = Array.from({ length: 11 }, (_, index) => ({
    id: `c${index}`,
    workspacePath: workspace,
    title: `Conversation ${index}`,
    createdAt: Date.now() - index * 60_000 - 60_000,
    updatedAt: Date.now() - index * 60_000,
    status: 'idle',
    permissionLevel: 'ask',
    model: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
    thinkingLevel: 'medium',
  }))
  writeFileSync(join(dataDirectory, 'conversations.json'), JSON.stringify({ version: 1, conversations }), 'utf-8')

  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, ALPHA_FAUX: '1', NODE_ENV: 'production' },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')

  const rail = window.getByRole('complementary')
  // Eight of the eleven, newest first, and a line that says how many are behind them.
  await expect(rail.getByRole('button', { name: /^Conversation 0 idle/ })).toBeVisible()
  await expect(rail.getByRole('button', { name: /^Conversation 7 idle/ })).toBeVisible()
  await expect(rail.getByRole('button', { name: /^Conversation 8 idle/ })).toHaveCount(0)

  const more = rail.getByRole('button', { name: 'Show all 11' })
  await expect(more).toHaveText('and 3 more')
  await more.click()

  await expect(rail.getByRole('button', { name: /^Conversation 10 idle/ })).toBeVisible()
  await expect(rail.getByRole('button', { name: 'Show fewer' })).toBeVisible()

  // The count on the folder's row is the whole truth, not what happens to be on screen.
  await expect(rail.getByTitle('11 conversations')).toHaveText('11')
  await app.close()
})
