import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, test } from '@playwright/test'

/**
 * PROTOTYPE ONLY — throwaway, on the `prototype/row-actions` branch. Renders the conversation
 * row's two candidate action shapes side by side (folder 1 icons, folder 2 a menu) and shoots
 * them at rest, on hover, and with the menu open.
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

test('the two candidate row shapes', async () => {
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
        summary('c3', one, 'add a test for the retry path', 300),
        summary('c4', two, 'the health check times out under load', 700),
        summary('c5', two, 'upgrade the client library', 900),
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
  await rail.screenshot({ path: join(SHOT_DIR, 'row-rest.png') })

  await window.getByRole('button', { name: 'rename the parser module idle' }).hover()
  await rail.screenshot({ path: join(SHOT_DIR, 'row-hover-icons.png') })

  await window.getByRole('button', { name: 'upgrade the client library idle' }).hover()
  await rail.screenshot({ path: join(SHOT_DIR, 'row-hover-menu.png') })

  await window.getByRole('button', { name: 'Actions for upgrade the client library' }).click()
  await rail.screenshot({ path: join(SHOT_DIR, 'row-menu-open.png') })

  await window.getByRole('button', { name: 'rename the parser module idle' }).hover()
  await window.getByRole('button', { name: 'More actions for rename the parser module' }).click()
  await rail.screenshot({ path: join(SHOT_DIR, 'row-icons-menu-open.png') })

  await app.close()
})
