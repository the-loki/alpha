import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { formatTokens, recordOf, usageTotals } from '../packages/domain/src/index.ts'
import { SessionStore, tipPath } from '../packages/sessions/src/index.ts'
import { launchWorkbench } from './agent'
import { closeScriptedProviders } from './scripted-provider'

test.afterEach(() => closeScriptedProviders())

test('a delegated call counts in the conversation before and after reopening', async () => {
  const { app, window, dataDirectory, workspace } = await launchWorkbench({
    level: 'full-access',
    replies: [
      { tool: { name: 'task', args: { agent: 'explore', prompt: 'find the parser' } } },
      'The parser is named pi.',
      'Done.',
    ],
  })
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill('delegate it')
  await composer.press('Enter')
  await expect(window.getByRole('main').locator('[data-role="assistant"]').last()).toContainText('Done.', {
    timeout: 20_000,
  })
  const index = JSON.parse(readFileSync(join(dataDirectory, 'conversations.json'), 'utf-8'))
  const id: string = index.conversations[0].id
  const store = new SessionStore(join(dataDirectory, 'sessions'))
  const read = store.entries(id, workspace)
  const parentTokens = tipPath(read.entries, read.leafId).reduce((sum, entry) => {
    if (entry.type !== 'message' || entry.message?.role !== 'assistant') return sum
    return sum + usageTotals(recordOf(entry.message).usage).totalTokens
  }, 0)
  const tokens = store.usage(id, workspace).totalTokens
  expect(tokens).toBeGreaterThan(parentTokens)
  const title = `delegate it\nTokens for this conversation: ${formatTokens(tokens)}`
  await expect(window.getByRole('heading', { level: 1 })).toHaveAttribute('title', title)
  await app.close()

  const reopened = await launchWorkbench({ provider: false, dataDirectory, workspace, keepState: true })
  await expect(reopened.window.getByRole('heading', { level: 1 })).toHaveAttribute('title', title)
  await reopened.app.close()
})
