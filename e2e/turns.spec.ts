import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

/** Replies are scripted; the slow stream is what makes "stop it mid-answer" testable. */
async function launch(
  options: { replies?: unknown[]; dataDirectory?: string; workspace?: string; slow?: boolean } = {},
) {
  const dataDirectory = options.dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      // Full access: these tests are about turn control, so no approval card intervenes.
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
      ALPHA_FAUX_REPLIES: JSON.stringify(options.replies ?? ['Answer.']),
      ...(options.slow === true ? { ALPHA_FAUX_TOKENS_PER_SECOND: '20', ALPHA_FAUX_TOKEN_SIZE: '4' } : {}),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  await window.setViewportSize({ width: 1440, height: 900 })
  return { app, window, dataDirectory, workspace }
}

async function ask(window: Page, text: string) {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}

test('Escape stops a running turn and keeps the part that arrived', async () => {
  const { app, window } = await launch({
    slow: true,
    replies: ['An answer long enough that it is still being written when the user stops it.'],
  })

  await ask(window, 'say something long')
  // The Stop control is the proof the window knows a turn is running, which is when Escape stops it.
  await expect(window.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 20_000 })
  const assistant = window.getByRole('main').locator('[data-role="assistant"]')
  // Wait for real text, so "the part that arrived" is a fact rather than an empty stream.
  await expect(assistant).toContainText('An answer', { timeout: 20_000 })
  await window.keyboard.press('Escape')

  await expect(window.getByText(/Stopped — what arrived before the stop is kept/)).toBeVisible()
  await expect(window.getByRole('button', { name: 'Send' })).toBeDisabled()
  const shown = (await assistant.innerText()).trim()
  expect(shown).toContain('An answer')
  // Stopped before the end: the rest of the sentence the model was writing never arrived.
  expect(shown).not.toContain('stops it.')
  await window.screenshot({ path: join(SHOT_DIR, 'turn-stopped.png') })

  // A stopped turn is not an error: the conversation takes the next prompt as it is.
  await ask(window, 'carry on')
  await expect(window.getByRole('main').getByText('carry on')).toBeVisible()
  await expect(window.getByRole('main').locator('[data-role="assistant"]').last()).toContainText('An answer', {
    timeout: 20_000,
  })
  await expect(window.getByText(/Stopped —/)).toHaveCount(1)

  await app.close()
})

test('a stopped turn survives a relaunch, marker and all', async () => {
  const first = await launch({
    slow: true,
    replies: ['A first answer that gets cut off partway through by the reader.'],
  })
  await ask(first.window, 'say something long')
  await expect(first.window.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 20_000 })
  await expect(first.window.getByRole('main').locator('[data-role="assistant"]')).toContainText('A first answer', {
    timeout: 20_000,
  })
  await first.window.keyboard.press('Escape')
  await expect(first.window.getByText(/Stopped —/)).toBeVisible()
  await first.app.close()

  const second = await launch({ dataDirectory: first.dataDirectory, workspace: first.workspace })
  await second.window.getByRole('button', { name: /^say something long (idle|working)$/ }).click()

  await expect(second.window.getByText(/Stopped —/)).toBeVisible()
  const restored = await second.window.getByRole('main').locator('[data-role="assistant"]').innerText()
  expect(restored).toContain('A first answer')
  expect(restored).not.toContain('by the reader.')
  await second.app.close()
})

test('a turn killed with the process can still be edited after the relaunch', async () => {
  const first = await launch({
    slow: true,
    replies: ['An answer nobody reads to the end, because the process goes away.'],
  })
  await ask(first.window, 'say something long')
  await expect(first.window.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 20_000 })
  await expect(first.window.getByRole('main').locator('[data-role="assistant"]')).toContainText('An answer', {
    timeout: 20_000,
  })
  // No Stop and no close: the process is killed with the turn in flight, which is the state a
  // crash leaves behind — a run nothing is driving, still sitting on the lane.
  first.app.process().kill('SIGKILL')

  const second = await launch({
    dataDirectory: first.dataDirectory,
    workspace: first.workspace,
    replies: ['The corrected answer.'],
  })
  await second.window.getByRole('button', { name: /^say something long (idle|working)$/ }).click()
  await second.window.getByRole('button', { name: 'Edit' }).first().click()
  await second.window.getByRole('textbox', { name: 'Edit the message' }).fill('a better question')
  await second.window.getByRole('button', { name: 'Resend, replacing what followed' }).click()

  // The edit landing is the assertion: a lane holding that dead operation refuses to navigate.
  await expect(second.window.getByRole('main').getByText('The corrected answer.')).toBeVisible({ timeout: 20_000 })
  await expect(second.window.getByRole('main')).not.toContainText('An answer nobody reads')
  await second.app.close()
})

test('a message typed while the agent works can be queued, and taken back', async () => {
  const { app, window } = await launch({
    slow: true,
    replies: ['The first answer, which takes its time.', 'The queued answer.'],
  })

  await ask(window, 'first task')
  await expect(window.getByRole('button', { name: 'Steer' })).toBeVisible({ timeout: 20_000 })

  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill('then do this')
  await window.getByRole('button', { name: 'Queue', exact: true }).click()

  const queued = window.getByRole('list', { name: 'Queued messages' })
  await expect(queued).toContainText('then do this')
  await window.screenshot({ path: join(SHOT_DIR, 'turn-queued.png') })

  // Take it back before the turn ends, so the queue empties and nothing was sent. A message that
  // has not been sent yet is deleted rather than cancelled — cancelling is for a steer, which the
  // running turn is already holding (ADR-0011).
  await window.getByRole('button', { name: /Delete the queued message/ }).click()
  await expect(queued).toHaveCount(0)
  await expect(window.getByRole('main').getByText('then do this')).toHaveCount(0)

  await app.close()
})

test('a queued message is sent when the turn it waited behind is done', async () => {
  const { app, window } = await launch({
    slow: true,
    replies: ['The first answer, which takes its time.', 'The queued answer.'],
  })

  await ask(window, 'first task')
  await expect(window.getByRole('button', { name: 'Steer' })).toBeVisible({ timeout: 20_000 })
  // The sidebar says a conversation is working while it works, not only once it is done.
  await expect(window.getByRole('complementary').getByRole('button', { name: /^first task working$/ })).toBeVisible()
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill('then do this')
  await window.getByRole('button', { name: 'Queue' }).click()

  await expect(window.getByRole('main').getByText('then do this')).toBeVisible({ timeout: 20_000 })
  await expect(window.getByRole('main').getByText('The queued answer.')).toBeVisible({ timeout: 20_000 })
  // The answer to the first task was written before the queued message was sent.
  const transcript = await window.getByRole('main').innerText()
  expect(transcript.indexOf('The first answer')).toBeLessThan(transcript.indexOf('then do this'))

  await app.close()
})

test('a message sent with Steer arrives inside the running turn, not after it', async () => {
  const { app, window } = await launch({
    slow: true,
    replies: ['The first answer, which takes its time.', 'The steered answer.'],
  })

  await ask(window, 'first task')
  await expect(window.getByRole('button', { name: 'Steer' })).toBeVisible({ timeout: 20_000 })
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill('actually, this instead')
  await window.getByRole('button', { name: 'Steer' }).click()

  await expect(window.getByRole('main').getByText('The steered answer.')).toBeVisible({ timeout: 20_000 })
  // Steering is a message, not a queue entry: it is in the transcript, and nothing is left waiting.
  const transcript = await window.getByRole('main').innerText()
  expect(transcript).toContain('actually, this instead')
  expect(transcript).toContain('The first answer')
  await expect(window.getByRole('list', { name: 'Queued messages' })).toHaveCount(0)

  await app.close()
})

test('Regenerate answers the same question again, replacing the answer', async () => {
  const { app, window } = await launch({ replies: ['The first answer.', 'The second answer.'] })

  await ask(window, 'what is the plan')
  await expect(window.getByRole('main').getByText('The first answer.')).toBeVisible({ timeout: 20_000 })

  await window.getByRole('button', { name: 'Regenerate' }).click()

  await expect(window.getByRole('main').getByText('The second answer.')).toBeVisible({ timeout: 20_000 })
  await expect(window.getByRole('main').getByText('The first answer.')).toHaveCount(0)
  expect(await window.getByRole('main').innerText()).toContain('what is the plan')
  await window.screenshot({ path: join(SHOT_DIR, 'turn-regenerated.png') })

  await app.close()
})

test('editing an earlier message says what it does to what followed', async () => {
  const { app, window } = await launch({
    replies: ['First answer.', 'Second answer.', 'The corrected answer.'],
  })

  await ask(window, 'first question')
  await expect(window.getByRole('main').getByText('First answer.')).toBeVisible({ timeout: 20_000 })
  await ask(window, 'second question')
  await expect(window.getByRole('main').getByText('Second answer.')).toBeVisible({ timeout: 20_000 })

  await window.getByRole('button', { name: 'Edit' }).first().click()
  const box = window.getByRole('textbox', { name: 'Edit the message' })
  await expect(box).toBeVisible()
  await box.fill('first question, corrected')
  await window.getByRole('button', { name: 'Resend, replacing what followed' }).click()

  await expect(window.getByRole('main').getByText('The corrected answer.')).toBeVisible({ timeout: 20_000 })
  const transcript = await window.getByRole('main').innerText()
  expect(transcript).toContain('first question, corrected')
  expect(transcript).not.toContain('second question')
  expect(transcript).not.toContain('Second answer.')

  await app.close()
})

test('thinking renders collapsed above the answer, with its own duration', async () => {
  const { app, window } = await launch({
    replies: [{ thinking: 'Weighing the options before answering.', text: 'Here is the answer.' }, 'Unused.'],
  })

  await ask(window, 'think about it')

  const thinking = window.getByText('Thinking · ', { exact: false })
  await expect(thinking).toBeVisible({ timeout: 20_000 })
  await expect(window.getByText('Weighing the options before answering.')).toBeHidden()

  await thinking.click()
  await expect(window.getByText('Weighing the options before answering.')).toBeVisible()
  await expect(window.getByRole('main').getByText('Here is the answer.')).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'turn-thinking.png') })

  await app.close()
})
