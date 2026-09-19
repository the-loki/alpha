import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, test } from '@playwright/test'

/**
 * PROTOTYPE ONLY — throwaway, on `prototype/tasks-shape`. A task sitting in its folder with its
 * runs beneath it, expanded and collapsed. No IPC, no task store: the shape is the point.
 */
const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

const summary = (id: string, workspacePath: string, title: string, minutesAgo: number) => ({
  id,
  workspacePath,
  title,
  createdAt: Date.now() - minutesAgo * 60_000 - 60_000,
  updatedAt: Date.now() - minutesAgo * 60_000,
  status: 'idle',
  permissionLevel: 'ask',
  model: { providerId: 'anthropic', modelId: 'claude-sonnet-4-5' },
  thinkingLevel: 'medium',
})

test('a task with its runs, inside its folder', async () => {
  test.setTimeout(90_000)
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const one = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  const two = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))

  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: one, name: 'alpha', lastOpenedAt: Date.now() } },
        recents: [
          { path: one, name: 'alpha', lastOpenedAt: Date.now() },
          { path: two, name: 'api-server', lastOpenedAt: Date.now() - 600_000 },
        ],
      },
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
        summary('c1', one, 'rename the parser module', 3),
        summary('c2', one, 'why does the sidebar drop the last conversation when a folder is removed', 40),
        summary('c4', two, 'the health check times out under load', 700),
      ],
    }),
    'utf-8',
  )

  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, ALPHA_FAUX: '1', NODE_ENV: 'production' },
  })
  const window = await app.firstWindow()
  await window.setViewportSize({ width: 1440, height: 900 })
  await window.waitForSelector('#root > *')

  const rail = window.locator('aside')
  await rail.screenshot({ path: join(SHOT_DIR, 'tasks-expanded.png') })

  await window.getByRole('button', { name: 'Collapse tasks in alpha' }).click()
  await rail.screenshot({ path: join(SHOT_DIR, 'tasks-collapsed.png') })

  await app.close()
})
