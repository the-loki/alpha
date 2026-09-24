import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { launchWorkbench } from './agent'
import { closeScriptedProviders } from './scripted-provider'

/**
 * Scheduled tasks, from the window: a task is made on the tasks page, "run now" runs it once while
 * the person who pressed it watches, the run is an ordinary conversation, and the level it was
 * given decides what an unattended run may do (ADR-0012).
 */
const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

test.afterEach(() => closeScriptedProviders())

async function launch(options: { provider?: boolean } = {}) {
  return launchWorkbench({
    level: 'full-access',
    provider: options.provider,
    replies: ['The nightly check found nothing.'],
  })
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
  // Scoped to the page: the rail names the task too, under its folder.
  await expect(window.getByRole('main').getByText('Nightly check').first()).toBeVisible()
  await window.getByRole('main').getByRole('button', { name: 'Nightly check' }).first().click()
  await expect(window.getByText('It has not run yet.')).toBeVisible()

  await window.getByRole('button', { name: 'Run now' }).click()

  // A run is a conversation titled with the task's name, and the history says how it went. Scoped:
  // the rail says the same word in the task's folded row.
  await expect(
    window
      .getByRole('main')
      .getByText(/Finished/)
      .first(),
  ).toBeVisible({ timeout: 20_000 })
  await window.screenshot({ path: join(SHOT_DIR, 'tasks-history.png') })

  // The rail has the task in its folder, folded, saying how the last run went; the run is a
  // conversation like any other, one fold below it (ticket #85). The rail is the workbench's own
  // index, so it speaks from beside the tasks page too — going back is one row in it, not a link.
  const rail = window.getByRole('complementary')
  const taskRow = rail.getByRole('button', { name: 'Expand the tasks in Nightly check' })
  await expect(taskRow).toBeVisible()
  await expect(rail.getByText('Finished')).toBeVisible()
  await taskRow.click()
  await expect(rail.getByRole('button', { name: /Nightly check/ }).first()).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'tasks-rail.png') })

  await app.close()
})

test('a run whose turn never started is a failed run rather than a finished one', async () => {
  // No provider at all, so the turn cannot start. A task is asked by hand, which goes straight to
  // the manager — past the composer's own gate, which will not send without a model at all — so this
  // is a refusal a window really can cause; it arrives as a case rather than a sentence (#199), and
  // the history says how the run went instead of showing a run that never ran as though it had.
  const { app, window } = await launch({ provider: false })

  await window.getByRole('button', { name: 'Tasks' }).click()
  await makeTask(window, 'Unrunnable check', 'look at the repository')
  await window.getByRole('button', { name: 'Run now' }).click()

  await window.getByRole('main').getByRole('button', { name: 'Unrunnable check' }).first().click()
  await expect(
    window
      .getByRole('main')
      .getByText(/Failed/)
      .first(),
  ).toBeVisible({ timeout: 20_000 })
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
  await expect(window.getByRole('main').getByText('Quiet check').first()).toBeVisible()

  // The task file says which level it will run at, which is what the run then uses.
  const stored = JSON.parse(readFileSync(join(dataDirectory, 'tasks.json'), 'utf-8'))
  expect(stored.tasks.map((task: { permissionLevel: string }) => task.permissionLevel)).toEqual(['full-access'])

  await app.close()
})
