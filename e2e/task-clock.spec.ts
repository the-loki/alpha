import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { APP_DIR, configureProvider, scriptedAgent } from './agent'

/**
 * The clock, and what an unattended run may do. A task whose moment passed while the workbench was
 * closed is caught up once, promptly after it starts (ADR-0013), and in that run a call that would
 * ask is refused at once rather than left waiting for a person who is not there (ADR-0012).
 */
const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

test('a task missed while the workbench was closed runs, and refuses what nobody can approve', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  const anHourAgo = Date.now() - 60 * 60_000

  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      ...scriptedAgent,
      language: 'en',
      permissionLevel: 'full-access',
    }),
    'utf-8',
  )

  // A task made an hour ago, due every five minutes, that never ran: the workbench opens and it is
  // owed a run.
  writeFileSync(
    join(dataDirectory, 'tasks.json'),
    JSON.stringify({
      version: 1,
      tasks: [
        {
          id: 'task-1',
          name: 'Nightly check',
          prompt: 'run the tests and report',
          workspacePath: workspace,
          permissionLevel: 'ask',
          schedule: { kind: 'every', minutes: 5 },
          enabled: true,
          createdAt: anHourAgo,
        },
      ],
    }),
    'utf-8',
  )

  configureProvider(dataDirectory)

  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      ALPHA_FAUX_REPLIES: JSON.stringify([{ tool: { name: 'bash', args: { command: 'echo hi' } } }, 'All done.']),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })

  // The run is a conversation of its own, named after the task, and it starts on its own.
  await expect(
    window
      .getByRole('complementary')
      .getByRole('button', { name: /Nightly check/ })
      .first(),
  ).toBeVisible({
    timeout: 20_000,
  })

  // Exact: the rail's own task row is named "Expand the tasks in …", which matches as a substring.
  await window.getByRole('button', { name: 'Tasks', exact: true }).click()
  // The page's own row: the sidebar is still on screen, with the run's conversation in it.
  await window.getByRole('main').getByRole('button', { name: 'Nightly check' }).first().click()

  // The run finished, and it says the command was refused because nobody was watching.
  await expect(window.getByText('Finished')).toBeVisible({ timeout: 20_000 })
  // Two places say it: the run's own row in the history, and the task's folded row in the rail.
  await expect(window.getByRole('main').getByText('· 1 refused')).toBeVisible()
  await expect(window.getByRole('complementary').getByText('1 refused', { exact: true })).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'tasks-catch-up.png') })

  await app.close()
})
