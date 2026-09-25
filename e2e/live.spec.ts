import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { APP_DIR, configureProvider } from './agent'

/**
 * A live run: the real provider Alpha is pointed at, reached over its own wire. Nothing here
 * is scripted — the answer comes off the network — so it stands beside the suite rather than in
 * it: it is skipped unless the environment names a provider, a model and a key, and it is the
 * only file that dials out (docs/constraints/04-testing.md C4.4, ADR-0022). The wire protocol
 * and the model's geometry are the environment's to say, so a second provider is an env file
 * rather than a second test file.
 */
const live = {
  baseUrl: process.env.ALPHA_LIVE_BASE_URL ?? '',
  model: process.env.ALPHA_LIVE_MODEL ?? '',
  key: process.env.ALPHA_LIVE_KEY ?? '',
  api: process.env.ALPHA_LIVE_API ?? 'openai-completions',
  authStyle: process.env.ALPHA_LIVE_AUTH_STYLE ?? 'api-key',
  contextWindow: Number(process.env.ALPHA_LIVE_CONTEXT ?? 128_000),
  maxTokens: Number(process.env.ALPHA_LIVE_OUTPUT ?? 8192),
  images: process.env.ALPHA_LIVE_IMAGES === '1',
}
const named = live.baseUrl !== '' && live.model !== '' && live.key !== ''

test.skip(!named, 'name a real provider, model and key (ALPHA_LIVE_BASE_URL, ALPHA_LIVE_MODEL, ALPHA_LIVE_KEY)')

const SHOT_DIR = join(process.cwd(), 'test-results')

/**
 * A solid red square, 64×64, built where it is used: a hand-copied base64 constant is a corrupted
 * picture waiting to happen, and a corrupted picture is the provider answering a 500 rather than
 * the color. Everything the model can say about this one is the color it was given.
 */
function redSquarePng(): Buffer {
  const size = 64
  const row = Buffer.alloc(1 + size * 3)
  for (let x = 0; x < size; x += 1) {
    row[1 + x * 3] = 230
    row[2 + x * 3] = 26
    row[3 + x * 3] = 26
  }
  const chunk = (tag: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(tag, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([head, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // color type: truecolor
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * The workbench as this person has it: the provider they described, and the key for it. The
 * vault's own encryption is a unit concern; here the key is a plaintext entry in this run's own
 * data directory, which is a `/tmp` one the teardown sweeps.
 */
async function launchLive(
  workspace: string,
  dataDirectory: string = mkdtempSync(join(tmpdir(), 'alpha-live-')),
  key: string = live.key,
): Promise<{
  app: Awaited<ReturnType<typeof electron.launch>>
  window: Page
  dataDirectory: string
}> {
  const folder = { path: workspace, name: 'live-workspace', lastOpenedAt: Date.now() }
  // A launch seeds a fresh directory; a directory that already ran keeps its own state — what it
  // remembers (which conversation to reopen) is exactly what a relaunch is here to test.
  if (!existsSync(join(dataDirectory, 'workbench-state.json'))) {
    writeFileSync(
      join(dataDirectory, 'workbench-state.json'),
      JSON.stringify({
        workspace: { selection: { kind: 'selected', workspace: folder }, recents: [folder] },
        language: 'en',
        permissionLevel: 'ask',
      }),
      'utf-8',
    )
  }
  configureProvider(dataDirectory, {
    id: 'live',
    api: live.api,
    baseUrl: live.baseUrl,
    authStyle: live.authStyle,
    key,
    // The numbers are this test's, not the model's: the turn it makes does not turn on them.
    models: [
      {
        id: live.model,
        name: live.model,
        contextWindow: live.contextWindow,
        maxTokens: live.maxTokens,
        reasoning: true,
        ...(live.images ? { images: true } : {}),
      },
    ],
  })

  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, NODE_ENV: 'production' },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window, dataDirectory }
}

const answers = (window: Page) => window.getByRole('main').locator('[data-role="assistant"]')

async function ask(window: Page, text: string): Promise<void> {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}

/** A turn is over when the box that sends is back: the stop control is what stands in its place.
 * The provider can trail the last word before its stream closes, so the box coming back gets a
 * real minute rather than an expect's default. */
const settled = (window: Page) =>
  expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 60_000 })

test.describe.configure({ mode: 'serial' })

/** The one conversation the first three tests share: asked, answered again, closed, reopened. */
let plain: Awaited<ReturnType<typeof launchLive>>

test('a turn runs on the provider itself, and its answer lands in the transcript', async () => {
  test.setTimeout(300_000)
  plain = await launchLive(mkdtempSync(join(tmpdir(), 'alpha-live-ws-')))

  await ask(plain.window, 'Without using any tools, reply with exactly this and nothing else: ALPHA LIVE OK')

  // The model's own answer, waited for as it arrives, and the run settling afterwards.
  await expect(answers(plain.window).first()).toContainText('ALPHA LIVE OK', { timeout: 240_000 })
  await settled(plain.window)
  await plain.window.screenshot({ path: join(SHOT_DIR, 'live-answer.png') })

  // What the turn cost is on the page: usage comes from the provider's own accounting, said as a
  // tooltip on the page's own title (C5.4), shown when the model reported any.
  await expect(plain.window.getByRole('heading', { level: 1 })).toHaveAttribute(
    'title',
    /Tokens for this conversation/,
    {
      timeout: 30_000,
    },
  )
})

test('the answer can be regenerated from its own question', async () => {
  test.setTimeout(300_000)
  // Regenerating moves the branch tip before the last question and asks it again: the answer is
  // replaced, not added to — so the run beginning again is the visible fact, then one answer.
  await plain.window.getByRole('button', { name: 'Regenerate' }).first().click()
  await expect(plain.window.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 60_000 })
  await settled(plain.window)
  await expect(answers(plain.window)).toHaveCount(1)
  await expect(answers(plain.window).first()).toContainText('ALPHA LIVE OK', { timeout: 240_000 })
})

test('the workbench is closed and reopened onto the same conversation', async () => {
  test.setTimeout(300_000)
  const expected = await answers(plain.window).count()
  await plain.app.close()

  // The conversation is Alpha's own store now: what the relaunch draws is what the runs wrote.
  const reopened = await launchLive(join(tmpdir(), 'alpha-live-ws-reopened'), plain.dataDirectory)
  await expect(answers(reopened.window)).toHaveCount(expected, { timeout: 60_000 })
  await expect(answers(reopened.window).first()).toContainText('ALPHA LIVE OK', { timeout: 60_000 })
  await reopened.window.screenshot({ path: join(SHOT_DIR, 'live-restored.png') })
  await reopened.app.close()
})

test('a command the model asks for waits for approval, and the answer that follows reaches the transcript', async () => {
  test.setTimeout(300_000)
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-live-ws-'))
  // A word the model cannot know without running the command this test approves.
  const printed = `LIVE-TOOL-OK-${Math.random().toString(16).slice(2, 10)}`
  writeFileSync(join(workspace, 'live-note.txt'), `${printed}\n`, 'utf-8')
  const { app, window } = await launchLive(workspace)

  // The test asks in words; that the model answers with a tool call is the model's decision.
  await ask(window, 'Run this exact command and nothing else, then tell me what it printed: cat live-note.txt')

  // Under Ask a command is the person's decision, and the agent waits for it.
  const approval = window.getByRole('button', { name: 'Allow once' })
  await expect(approval).toBeVisible({ timeout: 240_000 })
  const before = await answers(window).count()
  await window.screenshot({ path: join(SHOT_DIR, 'live-approval.png') })
  await approval.click()

  // The answer to the command is a message that did not exist when the command was approved — the
  // tool's own row carries the output too, so counting messages is what tells the two apart.
  await expect(answers(window)).toHaveCount(before + 1, { timeout: 240_000 })
  await expect(answers(window).last()).toContainText(printed, { timeout: 240_000 })
  await settled(window)
  await window.screenshot({ path: join(SHOT_DIR, 'live-tool.png') })

  await app.close()
})

test('a picture the person attached reaches the model, and the answer is about the picture', async () => {
  test.setTimeout(300_000)
  test.skip(!live.images, 'the provider said nothing about pictures (ALPHA_LIVE_IMAGES=1)')
  const { app, window } = await launchLive(mkdtempSync(join(tmpdir(), 'alpha-live-ws-')))

  const picture = join(tmpdir(), 'alpha-live-red.png')
  writeFileSync(picture, redSquarePng())
  await window.setInputFiles('input[type="file"]', picture)
  await ask(window, 'What is the dominant color of the attached picture? Answer with the color word only.')

  await expect(answers(window).first()).toContainText(/red/i, { timeout: 240_000 })
  await settled(window)
  await window.screenshot({ path: join(SHOT_DIR, 'live-image.png') })

  await app.close()
})

test('the thinking effort the person picks is the turn the model runs', async () => {
  test.setTimeout(300_000)
  const { app, window } = await launchLive(mkdtempSync(join(tmpdir(), 'alpha-live-ws-')))

  // The band is on the conversation's own page, so the conversation is begun first; then Off is a
  // decision about the model's room, which this conversation carries from here on.
  await ask(window, 'Reply with exactly this and nothing else: READY')
  await expect(answers(window).first()).toContainText('READY', { timeout: 240_000 })
  await settled(window)
  await window.getByLabel('Thinking effort').selectOption('off')
  await ask(window, 'What is 17 times 23? Reply with the number only.')

  await expect(answers(window)).toHaveCount(2, { timeout: 240_000 })
  await expect(answers(window).last()).toContainText('391', { timeout: 240_000 })
  await settled(window)
  await window.screenshot({ path: join(SHOT_DIR, 'live-thinking.png') })

  await app.close()
})

test('a refused key is said out loud: one failed answer carrying the reason, and no empty rows', async () => {
  test.setTimeout(300_000)
  const { app, window } = await launchLive(mkdtempSync(join(tmpdir(), 'alpha-live-ws-')), undefined, 'not the key')
  await ask(window, 'Reply with exactly this and nothing else: ALPHA LIVE OK')

  // The provider refuses the key; the window says so. Silence — and empty rows for the attempts
  // tried before giving up — is the bug this guards against.
  await expect(window.getByRole('button', { name: 'Stop' })).toBeVisible({ timeout: 60_000 })
  await settled(window)
  const answersIn = window.getByRole('main').locator('[data-role="assistant"]')
  await expect(answersIn).toHaveCount(1, { timeout: 30_000 })
  await expect(answersIn.first()).not.toHaveText('')
  await window.screenshot({ path: join(SHOT_DIR, 'live-refused.png') })
  await app.close()
})
