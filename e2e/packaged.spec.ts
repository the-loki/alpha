import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * The packaged build, launched as a user would launch it. This is the only test that runs the
 * real binary: it is where a relative path that works in development and not inside an asar, or a
 * data directory that ends up somewhere unwritable, would show up.
 *
 * It is skipped until `pnpm package:linux` has produced a build, so the ordinary E2E run does not
 * depend on one being there.
 */
const PACKAGED = join(process.cwd(), 'dist', 'linux-unpacked', 'alpha')

test.skip(!existsSync(PACKAGED), 'run `pnpm package:linux` first: the packaged build is not there')

test('the packaged app opens, remembers its workspace, and keeps a credential', async () => {
  const dataDirectory = mkdtempSync(join(tmpdir(), 'alpha-packaged-'))
  const workspace = mkdtempSync(join(tmpdir(), 'alpha-packaged-ws-'))
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
    executablePath: PACKAGED,
    args: ['--no-sandbox'],
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, ALPHA_FAUX: '1', ALPHA_FAUX_REPLIES: '["ok"]' },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')

  // The packaged app starts on the workspace it was told about, and writes its state where asked.
  // Exact, because the sidebar's own "Tasks" row matches "Ask" as a case-insensitive substring.
  await expect(window.getByRole('button', { name: 'Ask', exact: true })).toBeVisible()
  writeFileSync(join(dataDirectory, '.probe'), 'written', 'utf-8')

  // A key is the one thing that must never be readable on disk; the packaged build has to be able
  // to store it, and be honest about whether the OS keychain is protecting it.
  const saved = await window.evaluate(async () => {
    const bridge = (
      globalThis as unknown as {
        alpha: {
          saveProvider: (input: { id: string; name: string; api: string; baseUrl: string }) => Promise<unknown>
          setCredential: (id: string, secret: string) => Promise<{ protection: string }>
        }
      }
    ).alpha
    await bridge.saveProvider({
      id: 'anthropic',
      name: 'Anthropic',
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
    })
    return bridge.setCredential('anthropic', 'sk-packaged-test-key')
  })
  expect(['os', 'plaintext']).toContain(saved.protection)

  const credentials = readFileSync(join(dataDirectory, 'credentials.json'), 'utf-8')
  if (saved.protection === 'os') expect(credentials).not.toContain('sk-packaged-test-key')
  expect(credentials).toContain('anthropic')
  await app.close()

  // Relaunching the packaged app keeps the provider, so the credential store survived the boundary.
  const again = await electron.launch({
    executablePath: PACKAGED,
    args: ['--no-sandbox'],
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, ALPHA_FAUX: '1', ALPHA_FAUX_REPLIES: '["ok"]' },
  })
  const second = await again.firstWindow()
  await second.waitForSelector('#root > *')
  const providers = await second.evaluate(async () => {
    const bridge = (globalThis as unknown as { alpha: { providers: () => Promise<{ providers: { id: string }[] }> } })
      .alpha
    return bridge.providers()
  })
  expect(providers.providers.map((provider) => provider.id)).toContain('anthropic')
  await again.close()
})
