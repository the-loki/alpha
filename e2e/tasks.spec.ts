import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

/**
 * Scheduled tasks, from the window: a task is made on the tasks page, "run now" runs it once while
 * the person who pressed it watches, the run is an ordinary conversation, and the level it was
 * given decides what an unattended run may do (ADR-0012).
 */
const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

async function launch() {
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
      permissionLevel: 'full-access',
    }),
    'utf-8',
  )

  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      ALPHA_FAUX: '1',
      ALPHA_FAUX_REPLIES: JSON.stringify(['The nightly check found nothing.']),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window, dataDirectory }
}

/** The form is a region of its own, so its fields are not confused with the header's controls. */
const form = (window: Page) => window.getByRole('region', { name: 'New task' })

async function makeTask(window: Page, name: string, prompt: string) {
  await window.getByRole('button', { name: 'New task', exact: true }).click()
  await form(window).getByLabel('Name').fill(name)
  await form(window).getByLabel('What to ask').fill(prompt)
  await form(window).getByRole('button', { name: 'Save task' }).click()
}

test('a task is made, runs on demand, and leaves a conversation behind', async () => {
  const { app, window } = await launch()

  await window.getByRole('button', { name: 'Tasks' }).click()
  await expect(window.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await makeTask(window, 'Nightly check', 'look at the repository and write a short note')
  await window.screenshot({ path: join(SHOT_DIR, 'tasks-list.png') })

  // It is on the list with a next run, and its history is empty until it has run.
  await expect(window.getByText('Nightly check')).toBeVisible()
  await window.getByRole('button', { name: 'Nightly check' }).click()
  await expect(window.getByText('It has not run yet.')).toBeVisible()

  await window.getByRole('button', { name: 'Run now' }).click()

  // A run is a conversation titled with the task's name, and the history says how it went.
  await expect(window.getByText(/Finished/)).toBeVisible({ timeout: 20_000 })
  await window.screenshot({ path: join(SHOT_DIR, 'tasks-history.png') })

  // And it is a conversation like any other: the sidebar has it under the folder.
  await expect(
    window
      .getByRole('complementary')
      .getByRole('button', { name: /Nightly check/ })
      .first(),
  ).toBeVisible()

  await app.close()
})

test('the level a task is given is the level it runs at, and the level is written down', async () => {
  const { app, window, dataDirectory } = await launch()

  await window.getByRole('button', { name: 'Tasks' }).click()
  await window.getByRole('button', { name: 'New task', exact: true }).click()
  await form(window).getByLabel('Name').fill('Quiet check')
  await form(window).getByLabel('What to ask').fill('read the repository and report')

  // The consequence of a level is stated where it is chosen, not discovered at 3am.
  await form(window).getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(window.getByText('Steps that need approval are refused while nobody is watching.')).toBeVisible()
  await form(window).getByRole('button', { name: 'Full access', exact: true }).click()
  await expect(window.getByText('It will do anything while nobody is watching.')).toBeVisible()

  // Saved from the same form the level was chosen in: opening a new one would start over.
  await form(window).getByRole('button', { name: 'Save task' }).click()
  await expect(window.getByText('Quiet check')).toBeVisible()

  // The task file says which level it will run at, which is what the run then uses.
  const stored = JSON.parse(readFileSync(join(dataDirectory, 'tasks.json'), 'utf-8'))
  expect(stored.tasks.map((task: { permissionLevel: string }) => task.permissionLevel)).toEqual(['full-access'])

  await app.close()
})
