import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { APP_DIR, configureProvider } from './agent'
import { closeScriptedProviders, startScriptedProvider } from './scripted-provider'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

test.afterEach(() => closeScriptedProviders())

/**
 * A window on a folder, in a chosen language. The language is a workbench setting like the
 * permission level, so a test writes it down rather than hoping the machine is in English.
 */
interface Launch {
  app: Awaited<ReturnType<typeof electron.launch>>
  window: Page
  dataDirectory: string
}

async function launch(
  language: string,
  options: { replies?: unknown[]; network?: { port: number; token: string } } = {},
): Promise<Launch> {
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
      ...(options.network === undefined ? {} : { network: { ...options.network, enabled: true, bind: 'local' } }),
    }),
    'utf-8',
  )

  const scripted = await startScriptedProvider({
    script: JSON.stringify(options.replies ?? [{ text: 'A short answer.' }]),
  })
  configureProvider(dataDirectory, { baseUrl: scripted.url })

  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: {
      ...process.env,
      ALPHA_DATA_DIR: dataDirectory,
      NODE_ENV: 'production',
    },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  return { app, window, dataDirectory }
}

test('the interface is written in the language the workbench was told to use', async () => {
  // `--lang=en-US` and `language: 'zh'` disagree on purpose: the setting is what wins, which is
  // the whole point of having one.
  const { app, window } = await launch('zh')

  // Starting a conversation is a strip command now; the index and the picker stayed in the rail.
  const sidebar = window.getByRole('complementary')
  await expect(sidebar.getByRole('button', { name: '添加目录' })).toBeVisible()
  await expect(window.getByRole('button', { name: /^新建会话/ })).toBeVisible()
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

  // The panel it was switched from is in the new language too, before anything is navigated: the
  // switch rewrites what is on screen rather than waiting for the next launch.
  await expect(window.getByRole('region', { name: '语言' })).toBeVisible()
  await window.getByRole('link', { name: '回到工作台' }).click()

  await expect(window.getByRole('complementary').getByRole('button', { name: '添加目录' })).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'language-switched.png') })
  await app.close()
})

test('the settings page and the gate are in that language too', async () => {
  const { app, window } = await launch('zh', {
    replies: [{ tool: { name: 'write', args: { path: 'notes.txt', content: 'written by the agent' } } }],
  })

  await window.getByRole('link', { name: '设置' }).click()
  await expect(window.getByRole('heading', { name: '设置' })).toBeVisible()
  await expect(window.getByRole('link', { name: '权限' })).toBeVisible()
  await window.getByRole('link', { name: '权限' }).click()
  await expect(window.getByRole('heading', { name: '默认权限级别' })).toBeVisible()
  await expect(
    window.getByRole('region', { name: '默认权限级别' }).getByRole('button', { name: /^询问/ }),
  ).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'language-zh-settings.png') })

  // Back to the workbench and through the gate: the card that asks is the one place a wrong
  // translation would be read while something is about to run.
  await window.getByRole('link', { name: '回到工作台' }).click()
  await window.getByRole('textbox', { name: '给 agent 的消息' }).fill('写个文件')
  await window.getByRole('textbox', { name: '给 agent 的消息' }).press('Enter')

  const card = window.getByRole('region', { name: '等你决定' })
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toContainText('想改一个文件')
  await expect(card.getByRole('button', { name: '允许一次' })).toBeVisible()
  await expect(card.getByRole('button', { name: '拒绝' })).toBeVisible()
  await window.screenshot({ path: join(SHOT_DIR, 'language-zh-gate.png') })
  await app.close()
})

test('the unlock screen follows the browser, because a locked client has not been told otherwise', async () => {
  const { createServer } = await import('node:net')
  const { chromium } = await import('@playwright/test')

  const probe = createServer()
  await new Promise<void>((settle) => probe.listen(0, '127.0.0.1', () => settle()))
  const address = probe.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>((settle) => probe.close(() => settle()))

  // The workbench itself is set to Chinese. A browser that has not unlocked has not been told
  // that — the language arrives with the launch state, and the launch state needs a session — so
  // the screen that asks for the token is written in the language of the machine reading it.
  const { app } = await launch('zh', { network: { port, token: 'the-token-a-person-would-paste' } })
  const browser = await chromium.launch()
  try {
    const english = await browser.newContext({ locale: 'en-US' })
    const englishPage = await english.newPage()
    await englishPage.goto(`http://127.0.0.1:${port}`)
    await expect(englishPage.getByRole('heading', { name: 'This workbench is not yours yet' })).toBeVisible()

    const chinese = await browser.newContext({ locale: 'zh-CN' })
    const chinesePage = await chinese.newPage()
    await chinesePage.goto(`http://127.0.0.1:${port}`)
    await expect(chinesePage.getByRole('heading', { name: '这个工作台还不是你的' })).toBeVisible()
    await expect(chinesePage.getByRole('button', { name: '进入工作台' })).toBeVisible()
    await chinesePage.screenshot({ path: join(SHOT_DIR, 'language-zh-unlock.png') })
  } finally {
    await browser.close()
    await app.close()
  }
})
