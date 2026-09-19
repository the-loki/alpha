import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

/**
 * A window on a folder, in a chosen language. The language is a workbench setting like the
 * permission level, so a test writes it down rather than hoping the machine is in English.
 */
async function launch(language: string): Promise<{ app: Awaited<ReturnType<typeof electron.launch>>; window: Page }> {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))
  writeFileSync(
    join(dataDirectory, 'workbench-state.json'),
    JSON.stringify({
      workspace: {
        selection: { kind: 'selected', workspace: { path: workspace, name: 'sandbox', lastOpenedAt: Date.now() } },
        recents: [{ path: workspace, name: 'sandbox', lastOpenedAt: Date.now() }],
      },
      language,
      permissionLevel: 'ask',
    }),
    'utf-8',
  )

  const app = await electron.launch({
    args: [REPO_ROOT, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: REPO_ROOT,
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, NODE_ENV: 'production' },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window }
}

test('the interface is written in the language the workbench was told to use', async () => {
  // `--lang=en-US` and `language: 'zh'` disagree on purpose: the setting is what wins, which is
  // the whole point of having one.
  const { app, window } = await launch('zh')

  const sidebar = window.getByRole('complementary')
  await expect(sidebar.getByRole('button', { name: '添加目录' })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: /^新建会话/ })).toBeVisible()
  await expect(sidebar.getByRole('heading', { name: '目录' })).toBeVisible()
  await expect(sidebar.getByRole('heading', { name: 'sandbox' })).toBeVisible()
  await expect(window.getByRole('link', { name: '设置' })).toBeVisible()
  await expect(window.getByRole('textbox', { name: '给 agent 的消息' })).toHaveAttribute(
    'placeholder',
    '让 agent 改点什么…',
  )
  await expect(window.getByRole('button', { name: '发送' })).toBeVisible()

  await window.setViewportSize({ width: 1440, height: 900 })
  await window.screenshot({ path: join(SHOT_DIR, 'language-zh.png') })
  await app.close()
})

test('the switch rewrites the interface without a relaunch', async () => {
  const { app, window } = await launch('en')
  await expect(window.getByRole('button', { name: 'Add a folder' })).toBeVisible()

  await window.getByRole('link', { name: 'Settings' }).click()
  await window.getByRole('link', { name: 'Appearance' }).click()
  // The language row is in the appearance panel, and a language is listed in itself: someone who
  // cannot read the interface is exactly who is looking for this.
  await window.getByRole('region', { name: 'Language' }).getByRole('button', { name: '简体中文' }).click()
  await window.getByRole('link', { name: /Back to the workbench/ }).click()

  await expect(window.getByRole('complementary').getByRole('button', { name: '添加目录' })).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'language-switched.png') })
  await app.close()
})
