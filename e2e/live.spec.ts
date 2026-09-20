import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { APP_DIR, configureProvider } from './agent'

/**
 * A live run: the real `pi` Alpha drives, against the provider the person configured. Nothing here
 * is scripted — the answer comes off the network — so it stands beside the suite rather than in it:
 * it is skipped unless the environment names an agent, a provider and a key, and it is the only
 * file that dials out (docs/constraints/04-testing.md C4.4, ADR-0022).
 */
const live = {
  agent: process.env.ALPHA_LIVE_PI ?? '',
  baseUrl: process.env.ALPHA_LIVE_BASE_URL ?? '',
  model: process.env.ALPHA_LIVE_MODEL ?? '',
  key: process.env.ALPHA_LIVE_KEY ?? '',
}

test.skip(
  Object.values(live).includes(''),
  'name a real agent, provider, model and key (ALPHA_LIVE_PI, ALPHA_LIVE_BASE_URL, ALPHA_LIVE_MODEL, ALPHA_LIVE_KEY)',
)

/** The one wire protocol a live run is checked over; a provider speaking another is another test. */
const LIVE_API = 'openai-completions'
const SHOT_DIR = join(process.cwd(), 'test-results')

/**
 * The workbench as this person has it: the agent they installed, the provider they described, and
 * the key for it. The vault's own encryption is a unit concern; here the key is a plaintext entry
 * in this run's own data directory, which is a `/tmp` one the teardown sweeps.
 */
async function launchLive(
  workspace: string,
): Promise<{ app: Awaited<ReturnType<typeof electron.launch>>; window: Page }> {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-live-'))
  const folder = { path: workspace, name: 'live-workspace', lastOpenedAt: Date.now() }
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: { selection: { kind: 'selected', workspace: folder }, recents: [folder] },
      agent: { path: live.agent },
      language: 'en',
      permissionLevel: 'ask',
    }),
    'utf-8',
  )
  configureProvider(dataDirectory, {
    id: 'live',
    api: LIVE_API,
    baseUrl: live.baseUrl,
    key: live.key,
    // The numbers are this test's, not the model's: the turn it makes does not turn on them.
    models: [{ id: live.model, name: live.model, contextWindow: 128000, maxTokens: 8192, reasoning: true }],
  })

  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, NODE_ENV: 'production' },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window }
}

const answers = (window: Page) => window.getByRole('main').locator('[data-role="assistant"]')

async function ask(window: Page, text: string): Promise<void> {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}

/** A turn is over when the box that sends is back: the stop control is what stands in its place. */
const settled = (window: Page) => expect(window.getByRole('button', { name: 'Send', exact: true })).toBeVisible()

test('a turn runs on the provider itself, and its answer lands in the transcript', async () => {
  test.setTimeout(300_000)
  const { app, window } = await launchLive(mkdtempSync(join(tmpdir(), 'alpha-live-ws-')))

  await ask(window, 'Without using any tools, reply with exactly this and nothing else: ALPHA LIVE OK')

  // The model's own answer, waited for as it arrives, and the run settling afterwards.
  await expect(answers(window).first()).toContainText('ALPHA LIVE OK', { timeout: 240_000 })
  await settled(window)
  await window.screenshot({ path: join(SHOT_DIR, 'live-answer.png') })

  await app.close()
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
