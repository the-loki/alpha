import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchWorkbench } from './agent'

/**
 * A long list in the rail shows a screenful and offers the rest: the palette is the
 * list you find things in, so a folder that folds is not a folder that hides. The fold is the
 * folder's own row — there is no chevron to aim at — and a folder with nothing under it is a
 * heading: it has nothing to fold and nothing to say about folding.
 */

const conversation = (workspace: string, id: string, title: string) => ({
  id,
  workspacePath: workspace,
  title,
  createdAt: Date.now() - 60_000,
  updatedAt: Date.now(),
  status: 'idle',
  permissionLevel: 'ask',
  model: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
  thinkingLevel: 'medium',
})

/** Two folders, one with a conversation and one with none, so both rows are on screen at once. */
async function launch() {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  const bare = mkdtempSync(join(tmpdir(), 'alpha-e2e-bare-'))
  const { app, window } = await launchWorkbench({
    workspace,
    level: 'ask',
    recents: [{ path: bare, name: 'bare', lastOpenedAt: Date.now() - 1000 }],
    conversations: [conversation(workspace, 'c0', 'Conversation 0')],
  })
  return { app, window, workspace, bare }
}

test('a folder folds by its own row, and a folder with nothing under it does not fold', async () => {
  const { app, window, workspace, bare } = await launch()
  const rail = window.getByRole('complementary')
  const sandbox = rail.locator(`[data-workspace="${workspace}"]`)
  const empty = rail.locator(`[data-workspace="${bare}"]`)

  // The folder with a conversation folds when its own row is clicked, and the label says which way
  // it goes. Nothing else in that row is a control.
  await expect(sandbox.getByRole('button', { name: 'Collapse sandbox' })).toBeVisible()
  await expect(sandbox.getByRole('button', { name: /^Conversation 0/ })).toBeVisible()
  await sandbox.getByRole('heading', { name: 'sandbox' }).click()
  await expect(sandbox.getByRole('button', { name: /^Conversation 0/ })).toHaveCount(0)
  await expect(sandbox.getByRole('button', { name: 'Expand sandbox' })).toBeVisible()
  await sandbox.getByRole('heading', { name: 'sandbox' }).click()
  await expect(sandbox.getByRole('button', { name: /^Conversation 0/ })).toBeVisible()

  // The folder with nothing under it is a heading, not a fold: it names itself, it says it is
  // empty, and no control in it would expand or collapse anything.
  await expect(empty.getByRole('heading', { name: 'bare' })).toBeVisible()
  await expect(empty.getByText('No conversations yet')).toBeVisible()
  await expect(empty.getByRole('button', { name: /Expand|Collapse/ })).toHaveCount(0)

  await app.close()
})

test('a folder with more conversations than fit says how many more there are', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
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
  const { app, window } = await launchWorkbench({ workspace, level: 'ask', conversations })

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
