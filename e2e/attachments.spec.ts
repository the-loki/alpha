import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

const REPO_ROOT = process.cwd()

/** A real one-pixel PNG, so what the transcript shows is a picture and not a broken box. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * A picture is part of the message, not a file path beside it: it is read in the window, sent as
 * bytes, and kept in the transcript. These tests drive the picker the way a person does — through
 * the button, which opens the platform's dialog.
 */
async function launch() {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-shots-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-shots-ws-'))
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: {
          kind: 'selected',
          workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() },
        },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      language: 'en',
      permissionLevel: 'full-access',
    }),
    'utf-8',
  )
  const shot = join(workspace, 'screenshot.png')
  writeFileSync(shot, PIXEL_PNG)
  const note = join(workspace, 'notes.txt')
  writeFileSync(note, 'not a picture')

  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      ALPHA_FAUX: '1',
      ALPHA_FAUX_REPLIES: JSON.stringify(['I see it.']),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window, shot, note }
}

/** Picking a file goes through the button, because that is the only way in there is. */
async function attach(window: Awaited<ReturnType<typeof launch>>['window'], path: string) {
  const chooser = window.waitForEvent('filechooser')
  await window.getByRole('button', { name: 'Attach a picture' }).click()
  await (await chooser).setFiles(path)
}

test('a picture goes with the message and stays in the transcript', async () => {
  const { app, window, shot } = await launch()

  await attach(window, shot)
  // Waiting for the read, not the click: the thumbnail is up when the bytes are.
  await expect(window.getByRole('img', { name: 'screenshot.png' })).toBeVisible()

  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill('what is wrong here')
  await composer.press('Enter')

  // Scoped to the message: the first thing said also becomes the conversation's title.
  const said = window.getByRole('main').locator('[data-role="user"]')
  await expect(said.getByRole('img', { name: 'Attached image' })).toBeVisible()
  await expect(said.getByText('what is wrong here')).toBeVisible()
  // Sent, so the composer is empty of it: what is attached to the next message is nothing.
  await expect(window.getByRole('img', { name: 'screenshot.png' })).toHaveCount(0)

  await app.close()
})

test('a picture is a message on its own', async () => {
  const { app, window, shot } = await launch()

  await attach(window, shot)
  await expect(window.getByRole('img', { name: 'screenshot.png' })).toBeVisible()
  await window.getByRole('button', { name: 'Send', exact: true }).click()

  await expect(window.getByRole('main').getByRole('img', { name: 'Attached image' })).toBeVisible()
  await app.close()
})

test('a file that is not a picture is refused out loud', async () => {
  const { app, window, note } = await launch()

  await attach(window, note)

  await expect(window.getByText('Only pictures up to 4 MB can be attached.')).toBeVisible()
  await expect(window.getByRole('img', { name: 'notes.txt' })).toHaveCount(0)
  await app.close()
})

test('the level the message runs at is chosen at the foot of the composer', async () => {
  const { app, window } = await launch()

  // The chip is not in the window's chrome any more: it sits with the message it governs.
  const chrome = window.getByRole('banner').filter({ hasText: 'Alpha' })
  await expect(chrome.getByRole('button', { name: 'Full access' })).toHaveCount(0)

  const foot = window.getByRole('button', { name: 'Full access' })
  await expect(foot).toBeVisible()
  await foot.click()
  // Opens upwards, and the levels are all there with what each one means.
  await expect(window.getByRole('menuitemradio', { name: /Ask/ })).toBeVisible()
  await window.getByRole('menuitemradio', { name: /Ask/ }).click()
  // Exact, because the sidebar's own "Tasks" row matches "Ask" as a substring.
  await expect(window.getByRole('button', { name: 'Ask', exact: true })).toBeVisible()

  await app.close()
})
