import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Locator, test } from '@playwright/test'
import { ask, type LaunchOptions, launchWorkbench } from './agent'
import { closeScriptedProviders } from './scripted-provider'

test.afterEach(() => closeScriptedProviders())

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')
const REPLY = 'Two files use that name. I can rename both.'
/** One line of code far wider than the page's column: what a code block does with it is the test. */
const LONG_CODE = `const wide = ${'someFunction(argumentOne, argumentTwo, argumentThree), '.repeat(3)}done`

/** Where a thing is on the page, for the tests about the page's shape rather than its words. */
async function boxOf(where: Locator) {
  const box = await where.boundingBox()
  if (box === null) throw new Error('nothing to measure')
  return box
}

/** A fresh install pointed at a real folder, with the agent's answers scripted rather than dialled. */
async function launch(
  options: {
    dataDirectory?: string
    replies?: string[]
    workspace?: string
    /** False leaves the workbench with no connection, for the tests about that state. */
    provider?: boolean
    slow?: boolean
    /** A configured endpoint, for the tests that need models to switch between. */
    models?: boolean
  } = {},
) {
  // The workbench opens at the size a person's opens at, and the tests that want another size ask
  // for it themselves.
  const settings: LaunchOptions = {
    level: 'ask',
    dataDirectory: options.dataDirectory,
    workspace: options.workspace,
    replies: options.replies ?? [REPLY],
    // The slow stream is what makes a turn catchable mid-answer, for the frames about streaming.
    ...(options.slow === true ? { slow: { tokenSize: 4, tokensPerSecond: 10 } } : {}),
    viewport: false,
  }
  if (options.provider === false) {
    settings.provider = false
  } else if (options.models === true) {
    // Written once: a relaunch over the same directory keeps whatever the test changed in
    // providers.json (the chosen default among them), so it neither rewrites the file nor starts
    // an endpoint it will not use — the first one is still running within the test.
    if (options.dataDirectory === undefined) {
      settings.providerOptions = {
        id: 'local',
        name: 'Local',
        models: [
          { id: 'local-7b', name: 'Local 7B', contextWindow: 32000, maxTokens: 4096, reasoning: false },
          { id: 'local-70b', name: 'Local 70B', contextWindow: 128000, maxTokens: 8192, reasoning: false },
        ],
      }
    } else {
      settings.provider = false
    }
  }
  return launchWorkbench(settings)
}

test('a message streams a reply into the transcript', async () => {
  const { app, window } = await launch()
  await window.setViewportSize({ width: 1440, height: 900 })

  await ask(window, 'rename the parser module')

  // The header takes the question as the conversation's name, so the bubble is what is asserted.
  await expect(window.getByRole('main').locator('[data-role="user"]')).toContainText('rename the parser module')
  await expect(window.getByRole('main').getByText(REPLY)).toBeVisible({ timeout: 15_000 })
  // The turn is over when the run's own controls are gone and Send is back, disabled again for the
  // next message: the composer says nothing about where it is in a turn.
  await expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()

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
  // Nothing under the box at all, and no mark in front of it — not while a turn is running either,
  // which is the state the note used to speak in.
  await expect(window.getByText('❯')).toHaveCount(0)
  await expect(window.getByText(/Enter sends|agent is working/)).toHaveCount(0)
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

  // The turn has to end before the app closes: the run's controls give way to Send again.
  await expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 30_000 })
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
  // The turn has to end before the app closes: the run's controls give way to Send again.
  await expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 30_000 })
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

test('the model is chosen at the foot of the composer, and a new conversation starts on it', async () => {
  test.setTimeout(90_000)
  // No turn runs: the point is the control and the record, and nothing here dials out.
  const { app, window, dataDirectory, workspace } = await launch({ models: true })
  await window.setViewportSize({ width: 1440, height: 900 })

  // With no conversation open the chip names what a new one will start on, and the menu is the
  // models the connection serves, under the name of that connection.
  await expect(window.getByRole('button', { name: 'Local 7B', exact: true })).toBeVisible()
  await window.getByRole('button', { name: 'Local 7B', exact: true }).click()
  // Grouped by connection, under its name: the models are named, not their endpoint.
  await expect(window.getByRole('menu').getByText('Local', { exact: true })).toBeVisible()
  await expect(window.getByRole('menuitemradio')).toHaveText(['Local 7B', 'Local 70B'])
  await window.getByRole('menuitemradio', { name: 'Local 70B' }).click()

  await expect(window.getByRole('button', { name: 'Local 70B', exact: true })).toBeVisible()
  expect(JSON.parse(readFileSync(join(dataDirectory, 'providers.json'), 'utf-8')).defaultModel).toEqual({
    providerId: 'local',
    modelId: 'local-70b',
  })
  await app.close()

  // And it is what the next launch starts a conversation on, which is the whole point of choosing.
  const reopened = await launch({ dataDirectory, workspace, models: true })
  await expect(reopened.window.getByRole('button', { name: 'Local 70B', exact: true })).toBeVisible()
  await reopened.app.close()
})

test('the page fills the room beside the rail, and the box stands in its column', async () => {
  const { app, window } = await launch({ replies: ['A short answer for the ledger.'] })
  // The size the workbench opens at, before any test asks for a viewport of its own: it is what
  // sizes the reading column, since the page fills whatever the rail leaves (C5.3).
  const opening = await window.evaluate(() => `${globalThis.innerWidth}x${globalThis.innerHeight}`)
  expect(opening).toBe('1200x800')

  await window.setViewportSize({ width: 1440, height: 900 })
  await ask(window, 'rename the parser module')
  await expect(window.getByRole('main')).toContainText('A short answer for the ledger.', { timeout: 15_000 })

  const page = await boxOf(window.getByRole('main'))
  const rail = await boxOf(window.getByRole('complementary'))
  const words = await boxOf(window.getByRole('main').locator('[data-role="assistant"] p').first())
  const box = await boxOf(window.getByRole('textbox', { name: 'Message the agent' }))
  const windowWidth = await window.evaluate(() => globalThis.innerWidth)

  // No blank beside the page: the half-rem gutter and the gap to the rail are all the room it
  // leaves, on both sides.
  expect(page.x - (rail.x + rail.width)).toBeLessThanOrEqual(8.5)
  expect(windowWidth - (page.x + page.width)).toBeLessThanOrEqual(8.5)
  // The box starts where an entry's words start, one text inset in: the bar's own padding (16px)
  // and its hairline (1px), which is what keeps the words inside the box it is drawn in.
  expect(box.x - words.x).toBeLessThan(20)
  expect(box.x - words.x).toBeGreaterThan(-1)

  // Narrower changes nothing about that: the page is still the room beside the rail.
  await window.setViewportSize({ width: 1024, height: 720 })
  const narrow = await boxOf(window.getByRole('main'))
  const narrowWidth = await window.evaluate(() => globalThis.innerWidth)
  expect(narrowWidth - (narrow.x + narrow.width)).toBeLessThanOrEqual(8.5)
  expect(narrow.width).toBeLessThan(page.width)

  await app.close()
})

test('a long line wraps inside the box, and a long code line scrolls in its block', async () => {
  const { app, window } = await launch({ replies: [`\`\`\`ts\n${LONG_CODE}\n\`\`\`\nA short note.`] })
  await window.setViewportSize({ width: 1440, height: 900 })

  const box = window.getByRole('textbox', { name: 'Message the agent' })
  const before = await boxOf(box)
  // Long enough to wrap past the field's own floor in any face a font swap may bring: the growth
  // being measured has to exceed min-height whatever the metrics are.
  await box.fill('A sentence with no break in it at all, written to see what the box does with it. '.repeat(6).trim())
  const after = await boxOf(box)

  // It wraps instead of widening — the box is the page's column either way — and it grows downwards.
  expect(Math.abs(after.width - before.width)).toBeLessThan(2)
  expect(after.height).toBeGreaterThan(before.height)

  await box.press('Enter')
  const code = window.getByRole('main').locator('[data-role="assistant"] pre')
  await expect(code).toBeVisible({ timeout: 15_000 })

  // The wide line stays inside its own block: the block fits the column and scrolls, rather than
  // pushing the page wider.
  const block = await boxOf(code)
  const page = await boxOf(window.getByRole('main'))
  expect(block.x + block.width).toBeLessThanOrEqual(page.x + page.width)
  expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(true)

  await app.close()
})

test('with no model configured the composer opens whole, and nothing under it explains the model', async () => {
  const { app, window } = await launch({ provider: false })

  // The foot is where a missing model is answered — by the control that chooses one, which reads
  // "No model" and carries the hint — so the box says nothing about it underneath.
  await expect(window.getByRole('button', { name: 'No model', exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Attach a picture', exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'Ask', exact: true })).toBeVisible()
  // Nothing under the box at all, and no mark in front of it.
  await expect(window.getByText(/No model configured yet/)).toHaveCount(0)
  await expect(window.getByText(/Enter sends/)).toHaveCount(0)
  await expect(window.getByText('❯')).toHaveCount(0)

  // And a message cannot leave: the box holds it, and the send control says so by being disabled.
  await ask(window, 'anything')
  await expect(window.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()

  await app.close()
})
