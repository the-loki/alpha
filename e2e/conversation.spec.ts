import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')
const REPLY = 'Two files use that name. I can rename both.'

/** A fresh install pointed at a real folder, with the model scripted rather than dialled. */
async function launch(
  options: { dataDirectory?: string; replies?: string[]; workspace?: string; faux?: boolean; slow?: boolean } = {},
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
      language: 'en',
      permissionLevel: 'ask',
    }),
    'utf-8',
  )

  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      ...(options.faux === false
        ? {}
        : { ALPHA_FAUX: '1', ALPHA_FAUX_REPLIES: JSON.stringify(options.replies ?? [REPLY]) }),
      // slow: a stream a test can catch mid-answer, for the frames that are about streaming.
      ...(options.slow === true ? { ALPHA_FAUX_TOKENS_PER_SECOND: '10', ALPHA_FAUX_TOKEN_SIZE: '4' } : {}),
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window, dataDirectory, workspace }
}

async function ask(window: Page, text: string) {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}

test('a message streams a reply into the transcript', async () => {
  const { app, window } = await launch()
  await window.setViewportSize({ width: 1440, height: 900 })

  await ask(window, 'rename the parser module')

  // The header takes the question as the conversation's name, so the bubble is what is asserted.
  await expect(window.getByRole('main').locator('[data-role="user"]')).toContainText('rename the parser module')
  await expect(window.getByRole('main').getByText(REPLY)).toBeVisible({ timeout: 15_000 })
  // The turn is over when the composer stops saying the agent is working, and it has cleared
  // itself, so Send is disabled again for the next message.
  await expect(window.getByText('Enter sends, Shift+Enter starts a new line.')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Send' })).toBeDisabled()

  await window.screenshot({ path: join(SHOT_DIR, 'conversation-settled.png') })
  await app.close()
})

test('the answer is visibly still arriving, with a caret at its end', async () => {
  const { app, window } = await launch({ slow: true })
  await window.setViewportSize({ width: 1440, height: 900 })
  await ask(window, 'rename the parser module')

  // The caret is the state: while it is there the answer is still arriving, and the actions
  // that only make sense on a finished answer are not offered yet.
  const caret = window.getByRole('main').locator('.caret')
  await expect(caret).toBeVisible({ timeout: 20_000 })
  // Once part of the answer is on screen, so the frame shows text still arriving rather than the
  // moment before the first token, when there is nothing but a caret.
  await expect(window.getByRole('main')).toContainText('Two files', { timeout: 20_000 })
  await expect(caret).toBeVisible()
  // It sits on the line that is still being written, right after the last character, rather than
  // on a line of its own below the text.
  const caretIsOnTheLine = await caret.evaluate((element) => {
    const caretBox = element.getBoundingClientRect()
    const paragraph = element.closest('p')
    if (paragraph === null) return false
    const textBox = paragraph.getBoundingClientRect()
    return caretBox.top >= textBox.top - 1 && caretBox.bottom <= textBox.bottom + 1
  })
  expect(caretIsOnTheLine).toBe(true)
  await expect(window.getByRole('button', { name: 'Regenerate' })).toHaveCount(0)
  await window.screenshot({ path: join(SHOT_DIR, 'conversation-streamed.png') })

  await expect(window.getByText('Enter sends, Shift+Enter starts a new line.')).toBeVisible({ timeout: 30_000 })
  await app.close()
})

test('the caret follows text that ends inside a code fence', async () => {
  const { app, window } = await launch({
    slow: true,
    replies: ['Here it is:\n\n```ts\nconst answer = 42\nconst next = answer + 1\n'],
  })
  await window.setViewportSize({ width: 1440, height: 900 })
  await ask(window, 'write me a snippet')

  // A stream rarely stops at a paragraph: an unclosed fence is a code block, and the caret has
  // to be in it rather than nowhere. Wait until the fence is what is being written.
  const caret = window.getByRole('main').locator('.caret')
  await expect(window.getByRole('main')).toContainText('const answer', { timeout: 20_000 })
  await expect(caret).toBeVisible()
  // Drawn inside the code block that is being written, not after it.
  const caretIsInTheCode = await caret.evaluate((element) => {
    const caretBox = element.getBoundingClientRect()
    const code = document.querySelector('[data-role="assistant"] pre')
    if (code === null) return false
    const codeBox = code.getBoundingClientRect()
    return caretBox.top >= codeBox.top - 1 && caretBox.bottom <= codeBox.bottom + 1
  })
  expect(caretIsInTheCode).toBe(true)
  await window.screenshot({ path: join(SHOT_DIR, 'conversation-code-caret.png') })
  await expect(window.getByText('Enter sends, Shift+Enter starts a new line.')).toBeVisible({ timeout: 30_000 })
  await app.close()
})

test('the conversation is listed, titled, and restored after a relaunch', async () => {
  const first = await launch()
  await ask(first.window, 'rename the parser module')
  await expect(first.window.getByText(REPLY)).toBeVisible({ timeout: 15_000 })
  await first.app.close()

  const second = await launch({ dataDirectory: first.dataDirectory, workspace: first.workspace })
  await second.window.setViewportSize({ width: 1440, height: 900 })

  const listed = second.window.getByRole('button', { name: /^rename the parser module (idle|working)$/ })
  await expect(listed).toBeVisible()
  await listed.click()

  await expect(second.window.getByText(REPLY)).toBeVisible()
  await second.window.screenshot({ path: join(SHOT_DIR, 'conversation-restored.png') })
  await second.app.close()
})

test('with no model configured the app opens and says what is missing', async () => {
  const { app, window } = await launch({ faux: false })

  await expect(window.getByText(/No model configured yet/)).toBeVisible()

  await ask(window, 'anything')
  await expect(window.getByText(/No model configured yet/)).toBeVisible()

  await app.close()
})
