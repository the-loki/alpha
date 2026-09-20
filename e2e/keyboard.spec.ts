import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { configureProvider, scriptedAgent } from './agent'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

/** A window on a workspace, with the model scripted so turns are cheap and deterministic. */
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
      ...scriptedAgent,
      language: 'en',
      permissionLevel: 'ask',
    }),
    'utf-8',
  )
  configureProvider(dataDirectory)

  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      ALPHA_FAUX_REPLIES: JSON.stringify(['Noted.']),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  // The folder arrives with the launch state; a shortcut pressed before it lands lands in a
  // workbench that does not know where it is yet.
  await window.getByRole('complementary').getByRole('heading', { name: 'sandbox' }).waitFor()
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window, workspace }
}

/**
 * Sends a message and waits for the turn to end. The message itself is what is asserted: the
 * scripted model restarts its script for every conversation, so answers repeat between them.
 */
async function ask(window: Page, text: string) {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
  await expect(window.getByRole('main').locator('[data-role="user"]').last()).toContainText(text)
  // Send is back when the run is over, and it is the only signal the composer gives: it says
  // nothing about the turn it is in. The reply is what makes that wait a real one — Send is also
  // there in the moment before the run starts.
  await expect(window.getByRole('main').locator('[data-role="assistant"]').last()).toContainText('Noted.', {
    timeout: 20_000,
  })
  await expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
}

/** Two conversations, so there is something to switch between. */
async function twoConversations(window: Page) {
  await ask(window, 'the first question')
  await window.getByRole('button', { name: /New conversation/ }).click()
  await ask(window, 'the second question')
}

test('Control-K switches conversations from the keyboard', async () => {
  const { app, window } = await launch()
  await twoConversations(window)
  await expect(window.getByRole('heading', { name: 'the second question' })).toBeVisible()

  await window.keyboard.press('ControlOrMeta+k')
  const palette = window.getByRole('dialog', { name: 'Switch conversation' })
  await expect(palette).toBeVisible()

  await expect(palette.getByRole('option')).toHaveCount(2)
  await window.screenshot({ path: join(SHOT_DIR, 'conversation-palette.png') })

  await palette.getByRole('textbox').fill('first')
  await expect(palette.getByRole('option', { name: /the first question/ })).toBeVisible()
  await expect(palette.getByRole('option', { name: /the second question/ })).toBeHidden()

  await window.keyboard.press('Enter')
  await expect(palette).toBeHidden()
  // The conversation the palette opened is the one in the pane: its own transcript is there.
  await expect(window.getByRole('main').getByRole('heading', { name: 'the first question' })).toBeVisible()
  await expect(window.getByRole('main').locator('[data-role="user"]')).toContainText('the first question')
  await app.close()
})

test('the arrow keys move through the list before Enter opens one', async () => {
  const { app, window } = await launch()
  await twoConversations(window)

  await window.keyboard.press('ControlOrMeta+k')
  const palette = window.getByRole('dialog', { name: 'Switch conversation' })
  await expect(palette).toBeVisible()

  // Newest first, so one ArrowDown is the older conversation.
  await window.keyboard.press('ArrowDown')
  await window.keyboard.press('Enter')
  await expect(window.getByRole('heading', { name: 'the first question' })).toBeVisible()
  await app.close()
})

test('Escape leaves the palette without changing anything', async () => {
  const { app, window } = await launch()
  await twoConversations(window)

  await window.keyboard.press('ControlOrMeta+k')
  await expect(window.getByRole('dialog', { name: 'Switch conversation' })).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(window.getByRole('dialog', { name: 'Switch conversation' })).toBeHidden()
  await expect(window.getByRole('heading', { name: 'the second question' })).toBeVisible()
  await app.close()
})

test('Control-N starts a new conversation and Control-comma opens settings', async () => {
  const { app, window } = await launch()
  await ask(window, 'a question to leave behind')
  // Wait for the turn to have made its conversation before starting another one: pressing Control-N
  // while the first is still being created is a race the app is allowed to lose either way, and the
  // assertion below is about what the keyboard does, not about that race.
  await expect(
    window.getByRole('complementary').getByRole('button', { name: /^a question to leave behind/ }),
  ).toBeVisible()

  await window.keyboard.press('ControlOrMeta+n')
  // The pane is empty, and the message that follows is a conversation of its own rather than one
  // more turn in the old one.
  await expect(window.getByRole('main').getByRole('heading', { name: 'sandbox' })).toBeVisible()
  await expect(window.getByRole('main').locator('[data-role]')).toHaveCount(0)

  await ask(window, 'a second question')
  await expect(
    window.getByRole('complementary').getByRole('button', { name: /^a question to leave behind/ }),
  ).toBeVisible()
  await expect(window.getByRole('complementary').getByRole('button', { name: /^a second question/ })).toBeVisible()

  await window.keyboard.press('ControlOrMeta+,')
  await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await app.close()
})
