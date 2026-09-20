import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { APP_DIR, configureProvider, scriptedAgent } from './agent'

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
/** A connection whose model says whether it takes pictures, and a key, so a turn can be asked for. */
function writeProvider(dataDirectory: string, images: boolean) {
  configureProvider(dataDirectory, {
    id: 'local',
    models: [{ id: 'local-7b', name: 'Local 7B', contextWindow: 32_000, maxTokens: 4_096, reasoning: false, images }],
  })
}

async function launch(options: { vision?: boolean } = {}) {
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
      ...scriptedAgent,
      language: 'en',
      permissionLevel: 'full-access',
    }),
    'utf-8',
  )
  writeProvider(dataDirectory, options.vision ?? true)
  const shot = join(workspace, 'screenshot.png')
  writeFileSync(shot, PIXEL_PNG)
  const note = join(workspace, 'notes.txt')
  writeFileSync(note, 'not a picture')

  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
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
async function attach(window: Awaited<ReturnType<typeof launch>>['window'], ...paths: string[]) {
  const chooser = window.waitForEvent('filechooser')
  await window.getByRole('button', { name: 'Attach a picture' }).click()
  await (await chooser).setFiles(paths)
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

test('a pile of pictures scrolls, and keeps its remove controls reachable', async () => {
  const { app, window } = await launch()
  // More pictures than the box can show at once, each with its own name, so the bound is what the
  // test is measuring.
  const pileDirectory = mkdtempSync(join(tmpdir(), 'alpha-pile-'))
  const pile = Array.from({ length: 20 }, (_, index) => join(pileDirectory, `pile-${index}.png`))
  for (const file of pile) writeFileSync(file, PIXEL_PNG)
  await attach(window, ...pile)
  await expect(window.locator('[aria-label="Attached pictures"] img')).toHaveCount(pile.length)

  // The pile scrolls inside its own box rather than growing the composer: the box is what bounds
  // it, and a picture's remove control sits outside that picture's own corner — so the box needs
  // room for it, or the control that takes a picture off the message is cut off.
  const measured = await window.evaluate(() => {
    const list = document.querySelector('[aria-label="Attached pictures"]')
    const remove = list?.querySelector('button')
    if (list === null || remove === null || remove === undefined) return null
    const box = list.getBoundingClientRect()
    const control = remove.getBoundingClientRect()
    return {
      scrolls: list.scrollHeight > list.clientHeight,
      inside: control.top >= box.top && control.right <= box.right,
    }
  })
  expect(measured).toEqual({ scrolls: true, inside: true })

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

test('a picture is turned away when the model cannot take one, and the reason is said', async () => {
  const { app, window, shot } = await launch({ vision: false })

  await attach(window, shot)

  // The model is named, and where to change it: a picture that silently does not arrive is the
  // kind of thing noticed too late.
  await expect(
    window.getByText('Local 7B does not take pictures. Turn that on for it under Models in Settings.'),
  ).toBeVisible()
  await expect(window.getByRole('img', { name: 'screenshot.png' })).toHaveCount(0)
  await app.close()
})

test('a model that takes pictures is handed the picture', async () => {
  const { app, window, shot } = await launch({ vision: true })

  await attach(window, shot)
  await expect(window.getByRole('img', { name: 'screenshot.png' })).toBeVisible()
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
