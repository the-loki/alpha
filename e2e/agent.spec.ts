import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()

/** A stand-in for pi: a script that answers like a version command, or fails like a broken one. */
function stubAgent(script: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-e2e-agent-'))
  const path = join(directory, 'pi')
  writeFileSync(path, `#!/bin/sh\n${script}\n`, 'utf-8')
  chmodSync(path, 0o755)
  return path
}

/**
 * Alpha ships no agent, so every state of this panel is a state of the machine it is on. Each test
 * pins that state through the setting the panel itself writes, which is what makes the four
 * answers — missing, found, too old, would not run — testable without installing anything.
 */
async function launch(agentPath: string) {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(directory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      language: 'en',
      permissionLevel: 'ask',
      agent: { path: agentPath },
    }),
    'utf-8',
  )
  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(directory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: { ...process.env, ALPHA_DATA_DIR: directory, NODE_ENV: 'production' },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window }
}

async function openAgentPanel(window: Page): Promise<void> {
  const settingsLink = window.getByRole('link', { name: 'Settings' })
  if ((await settingsLink.count()) > 0) await settingsLink.click()
  await window.getByRole('link', { name: 'Agent', exact: true }).click()
}

test('an agent that is not installed is a sentence and a command, not a dead window', async () => {
  const { app, window } = await launch('/nonexistent/pi')

  await openAgentPanel(window)

  await expect(window.getByText('pi is not installed yet.', { exact: false })).toBeVisible()
  await expect(window.getByText('npm install -g --ignore-scripts @earendil-works/pi-coding-agent')).toBeVisible()
  await expect(window.getByRole('button', { name: 'Install pi for me' })).toBeVisible()
  // Asking again is a thing the person can do, and it answers the same way.
  await window.getByRole('button', { name: 'Look again' }).click()
  await expect(window.getByText('pi is not installed yet.', { exact: false })).toBeVisible()

  await app.close()
})

test('an agent Alpha can run is named with where it is and what version it answered', async () => {
  const path = stubAgent('echo 0.86.0')
  const { app, window } = await launch(path)

  await openAgentPanel(window)

  await expect(window.getByText(`Found pi 0.86.0 at ${path}`)).toBeVisible()
  await expect(window.getByRole('button', { name: 'Install pi for me' })).toBeVisible()

  await app.close()
})

test('an agent that is too old says which version Alpha needs', async () => {
  const path = stubAgent('echo 0.85.1')
  const { app, window } = await launch(path)

  await openAgentPanel(window)

  await expect(window.getByText(`pi 0.85.1 is older than Alpha needs`, { exact: false })).toBeVisible()
  await expect(window.getByText('0.86.0', { exact: false })).toBeVisible()

  await app.close()
})

test('an agent that is there but will not run says why rather than looking installed', async () => {
  const path = stubAgent('echo "cannot execute: wrong architecture" >&2\nexit 126')
  const { app, window } = await launch(path)

  await openAgentPanel(window)

  await expect(window.getByText('but it would not run', { exact: false })).toBeVisible()
  await expect(window.getByText('wrong architecture', { exact: false })).toBeVisible()
  await expect(window.getByText('Found pi 0.86.0', { exact: false })).toHaveCount(0)

  await app.close()
})
