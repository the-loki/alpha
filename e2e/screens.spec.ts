import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { ask, launchWorkbench } from './agent'
import { closeScriptedProviders } from './scripted-provider'

/**
 * Every screen, drawn once, with a picture of each kept in `test-results/screens/`. The window seam
 * (C4.2): a design change is judged on what these look like, and a screen that stops drawing its
 * own title — or throws while drawing it — fails here rather than in a screenshot nobody opens.
 *
 * `e2e/design.spec.ts` is the other half of the same idea: it measures the grid these are read
 * against. This one is for the eye, and it is the fastest way to see the whole app at once.
 */
const SHOTS = join(process.cwd(), 'test-results', 'screens')
mkdirSync(SHOTS, { recursive: true })

test.afterEach(() => closeScriptedProviders())

const SCRIPT = [
  { tool: { name: 'read', args: { path: 'notes.txt' } } },
  {
    text: 'It says hello from the ledger.',
    tool: { name: 'edit', args: { path: 'notes.txt', edits: [{ oldText: 'hello', newText: 'goodbye' }] } },
  },
  { tool: { name: 'bash', args: { command: 'cat missing.txt' } } },
  'The last one failed; the file does not exist.',
]

async function launch(options: { level?: string; replies?: unknown[]; noFolder?: boolean } = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(join(workspace, 'notes.txt'), 'hello from the ledger')
  return launchWorkbench({
    workspace,
    // A workbench that has never been given a folder: the first screen a person ever sees.
    noFolder: options.noFolder === true,
    level: options.level ?? 'full-access',
    replies: options.replies ?? SCRIPT,
  })
}

/** Two painted frames and a breath: nothing is captured mid-animation. */
async function picture(window: Page, name: string): Promise<void> {
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await window.waitForTimeout(300)
  await window.screenshot({ path: join(SHOTS, `${name}.png`) })
}

const settled = (window: Page) =>
  expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 30_000 })

test('the workbench draws every screen it has, and they are kept as pictures', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()

  // The welcome with nothing said on it yet, and the palette over it.
  await expect(window.getByRole('main').getByText('sandbox')).toBeVisible()
  await picture(window, 'empty')
  await window.keyboard.press('Control+k')
  await expect(window.getByRole('dialog', { name: 'Switch conversation' })).toBeVisible()
  await picture(window, 'palette')
  await window.keyboard.press('Escape')

  // A turn with a ledger in it: a read, an edit, a command that failed.
  await ask(window, 'check the notes file')
  await settled(window)
  await expect(window.getByRole('main').getByText('The last one failed')).toBeVisible()
  await picture(window, 'conversation')

  // The rail's own row menu, which floats over the rail.
  const actions = window.getByRole('button', { name: /^Actions for / }).first()
  await actions.hover()
  await actions.click()
  await expect(window.getByRole('menuitem', { name: 'Archive' })).toBeVisible()
  await picture(window, 'rail-menu')
  await window.keyboard.press('Escape')

  await app.close()
})

test('the tasks page draws, empty, as a form, and with a task on it', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()

  await window.getByRole('button', { name: 'Tasks' }).click()
  await expect(window.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible()
  await picture(window, 'tasks-empty')

  await window.getByRole('button', { name: 'New task', exact: true }).click()
  await expect(window.getByRole('region', { name: 'New task' })).toBeVisible()
  await picture(window, 'tasks-form')

  const form = window.getByRole('region', { name: 'New task' })
  await form.getByLabel('Name').fill('Nightly check')
  await form.getByLabel('What to ask').fill('Check the notes file and report anything odd.')
  await form.getByRole('button', { name: 'Save task' }).click()
  await expect(window.getByText('Next run in')).toBeVisible()
  await picture(window, 'tasks-list')

  await app.close()
})

test('every settings panel draws under its own title', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch()
  await window.getByRole('link', { name: 'Settings' }).click()

  // The walk reads the menu the product draws, and the count says how many rows it owes: the last
  // copy of this list had a row fewer than the menu had (MCP servers was never opened), and a walk
  // over whatever the menu happens to show would pass just the same with a panel gone.
  const rows = window.getByRole('navigation', { name: 'Settings sections' }).getByRole('listitem')
  const listed = await rows.allTextContents()
  expect(listed).toHaveLength(5)
  for (const tab of listed) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    await expect(window.getByRole('main').getByRole('heading', { level: 1, name: tab })).toBeVisible()
    await picture(window, `settings-${tab.toLowerCase().replace(' ', '-')}`)
  }

  await app.close()
})

test('the tasks page and every settings panel draw in the dark palette too', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch({ replies: ['The nightly check found nothing.'] })

  // A page is one palette at a time: the same screens in the dark are the other half of the set,
  // and the half where a hairline or a grouped block is easiest to lose.
  await window.getByRole('link', { name: 'Settings' }).click()
  await window.getByRole('link', { name: 'Appearance', exact: true }).click()
  await window.getByRole('button', { name: 'Dark' }).click()

  // Off the menu, for the reason the walk above reads it: this list had gone a row short as well.
  const rows = window.getByRole('navigation', { name: 'Settings sections' }).getByRole('listitem')
  const listed = await rows.allTextContents()
  expect(listed).toHaveLength(5)
  for (const tab of listed) {
    await window.getByRole('link', { name: tab, exact: true }).click()
    await expect(window.getByRole('main').getByRole('heading', { level: 1, name: tab })).toBeVisible()
    await picture(window, `dark-settings-${tab.toLowerCase().replace(' ', '-')}`)
  }

  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await window.getByRole('button', { name: 'Tasks' }).click()
  await picture(window, 'dark-tasks-empty')

  await window.getByRole('button', { name: 'New task', exact: true }).click()
  await expect(window.getByRole('region', { name: 'New task' })).toBeVisible()
  await picture(window, 'dark-tasks-form')

  const form = window.getByRole('region', { name: 'New task' })
  await form.getByLabel('Name').fill('Nightly check')
  await form.getByLabel('What to ask').fill('Check the notes file and report anything odd.')
  await form.getByRole('button', { name: 'Save task' }).click()
  await expect(window.getByText('Next run in')).toBeVisible()
  await picture(window, 'dark-tasks-list')

  await app.close()
})

test('the gate card and the dark palette draw as well as the rest', async () => {
  test.setTimeout(120_000)
  const { app, window } = await launch({ level: 'ask' })
  // The gate is the picture; the run stays where it is, with the card still waiting, because what
  // comes after a decision is the turn settling and that is another spec's subject.
  await ask(window, 'change the file')
  await expect(window.getByRole('button', { name: 'Allow once' })).toBeVisible({ timeout: 30_000 })
  await picture(window, 'gate')

  await window.getByRole('link', { name: 'Settings' }).click()
  await window.getByRole('link', { name: 'Appearance', exact: true }).click()
  await window.getByRole('button', { name: 'Dark' }).click()
  await window.getByRole('link', { name: 'Back to the workbench' }).click()
  await expect(window.getByRole('button', { name: 'Ask', exact: true })).toBeVisible()
  await picture(window, 'dark-conversation')

  // The overlays are where the dark palette is easiest to get wrong: a panel, a menu and a palette
  // are all one step off the surface they float over, and in the dark that step is three percent.
  await window.keyboard.press('Control+k')
  await expect(window.getByRole('dialog', { name: 'Switch conversation' })).toBeVisible()
  await picture(window, 'dark-palette')
  await window.keyboard.press('Escape')

  await window.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(window.getByRole('menu', { name: 'Permission level' })).toBeVisible()
  await picture(window, 'dark-level-menu')
  await window.keyboard.press('Escape')

  const actions = window.getByRole('button', { name: /^Actions for / }).first()
  await actions.hover()
  await actions.click()
  await expect(window.getByRole('menuitem', { name: 'Archive' })).toBeVisible()
  await picture(window, 'dark-rail-menu')

  await app.close()
})

test('the screen a person sees before they have a folder draws too', async () => {
  test.setTimeout(60_000)
  const { app, window } = await launch({ noFolder: true })
  await expect(window.getByRole('button', { name: 'Choose a folder', exact: true })).toBeVisible()
  await picture(window, 'first-run')
  await app.close()
})
