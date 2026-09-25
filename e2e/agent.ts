/**
 * The seams the suites test through. One is the provider's wire: Alpha ships no agent of its own
 * to stand in — the agent is embedded in its main process, and the honest seam ends at the
 * provider's wire — so the stand-in is an endpoint on loopback (`startScriptedProvider`, in
 * ./scripted-provider), and a spec points providers.json at it the way a person points theirs at
 * a host. The other is the launch itself: `launchWorkbench` writes the state a person's first run
 * would have, starts the scripted endpoint, and opens the window, so a spec says only what makes
 * it different — the replies, the level, the absence of a folder.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ElectronApplication, _electron as electron, expect, type Page } from '@playwright/test'

import { startScriptedProvider } from './scripted-provider'

/** Where the workbench lives: one package under apps/, and every spec launches its built bundle. */
export const APP_DIR = join(process.cwd(), 'apps', 'desktop')

/** What a launch hands back: the app, its first window, and the two folders it was given. */
export type Launch = {
  app: ElectronApplication
  window: Page
  dataDirectory: string
  workspace: string
}

/** How a launch differs from a person's first run. Every field is optional and says one fact. */
export type LaunchOptions = {
  /** Reuses a data directory across launches, so a relaunch sees what the last run left. */
  dataDirectory?: string
  workspace?: string
  /** The name the workspace wears in the sidebar and the header ('sandbox'). */
  workspaceName?: string
  /** Further recents beside the workspace itself. */
  recents?: unknown[]
  /** A workbench that has never been given a folder: the first screen a person ever sees. */
  noFolder?: boolean
  /** The state file verbatim, instead of the composed one. */
  state?: unknown
  /** Leaves workbench-state.json as the last launch left it — a relaunch keeps its state, a
      first run has none. */
  keepState?: boolean
  language?: string
  level?: string
  network?: { port: number; token: string }
  /** Seeds conversations.json, so the workbench opens with conversations already in it. */
  conversations?: unknown[]
  /** Seeds mcp.json: the MCP servers this launch is configured with, written as the panel writes them. */
  mcp?: unknown[]
  /** False starts no scripted endpoint and writes no providers.json. */
  provider?: boolean
  /** What configureProvider is told besides the scripted endpoint's URL. */
  providerOptions?: Parameters<typeof configureProvider>[1]
  /** What the scripted endpoint answers, one reply per turn. */
  replies?: unknown[]
  /** Slows the stream, so a turn is catchable mid-answer. */
  slow?: { tokenSize: number; tokensPerSecond: number }
  env?: Record<string, string>
  /**
   * False leaves the window at the size the workbench opens at (1200x800) — for a spec that is not
   * about the window at all, and for the browser client, which has no window of ours to size.
   */
  resize?: boolean
}

/**
 * A connection for the conversation to run on, with a key for it. A turn is refused before the
 * provider is asked unless Alpha knows a model and holds a key, so a spec that asks for a
 * turn writes both files. The key is a plaintext vault entry — the scripted endpoint on loopback
 * ignores Authorization entirely — and the base URL is the endpoint a spec started for itself
 * (`http://127.0.0.1:<port>/v1`); a spec that means to reach a real provider names one (C4.4's
 * live seam).
 */
export function configureProvider(
  dataDirectory: string,
  options: {
    id?: string
    name?: string
    images?: boolean
    models?: unknown[]
    /** What the agent is told to dial, for the one spec that dials something real. */
    api?: string
    /** How the key rides the request, when the endpoint only takes one door. */
    authStyle?: string
    baseUrl?: string
    key?: string
  } = {},
): void {
  const id = options.id ?? 'scripted'
  const model = options.models ?? [
    {
      id: 'scripted-model',
      name: 'Scripted model',
      contextWindow: 32000,
      maxTokens: 4096,
      reasoning: false,
      ...(options.images === undefined ? {} : { images: options.images }),
    },
  ]
  writeFileSync(
    join(dataDirectory, 'providers.json'),
    JSON.stringify({
      version: 1,
      providers: [
        {
          id,
          name: options.name ?? 'Scripted',
          api: options.api ?? 'openai-completions',
          baseUrl: options.baseUrl ?? 'https://llm.internal.example/v1',
          ...(options.authStyle === undefined ? {} : { authStyle: options.authStyle }),
          models: model,
        },
      ],
    }),
    'utf-8',
  )
  writeFileSync(
    join(dataDirectory, 'credentials.json'),
    JSON.stringify({
      version: 1,
      entries: [{ providerId: id, protection: 'plaintext', payload: options.key ?? 'a key the endpoint never checks' }],
    }),
    'utf-8',
  )
}

/** The state file: either what the spec said verbatim, the last launch's, or the composed one. */
function writeLaunchState(dataDirectory: string, workspace: string, options: LaunchOptions): void {
  if (options.state !== undefined) {
    writeFileSync(join(dataDirectory, 'workbench-state.json'), JSON.stringify(options.state), 'utf-8')
    return
  }
  if (options.keepState === true) return
  const name = options.workspaceName ?? 'sandbox'
  const folder = { path: workspace, name, lastOpenedAt: Date.now() }
  const state = {
    workspace:
      options.noFolder === true
        ? { selection: { kind: 'none' }, recents: [] }
        : { selection: { kind: 'selected', workspace: folder }, recents: [folder, ...(options.recents ?? [])] },
    language: options.language ?? 'en',
    permissionLevel: options.level ?? 'ask',
    ...(options.network === undefined ? {} : { network: { enabled: true, bind: 'local', ...options.network } }),
  }
  writeFileSync(join(dataDirectory, 'workbench-state.json'), JSON.stringify(state), 'utf-8')
}

/** Alpha as launched for real, with whatever makes the spec's situation different filled in. */
export async function launchWorkbench(options: LaunchOptions = {}): Promise<Launch> {
  const dataDirectory = options.dataDirectory ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-'))
  const workspace = options.workspace ?? mkdtempSync(join(tmpdir(), 'alpha-e2e-ws-'))

  // A turn is refused before the provider is asked unless Alpha knows a model and holds a key,
  // so a launch that means to answer writes both files.
  if (options.provider !== false) {
    const scripted = await startScriptedProvider({
      script: JSON.stringify(options.replies ?? ['Answer.']),
      ...(options.slow === undefined ? {} : options.slow),
    })
    configureProvider(dataDirectory, { baseUrl: scripted.url, ...options.providerOptions })
  }
  if (options.mcp !== undefined) {
    writeFileSync(join(dataDirectory, 'mcp.json'), JSON.stringify({ servers: options.mcp }), 'utf-8')
  }
  if (options.conversations !== undefined) {
    writeFileSync(
      join(dataDirectory, 'conversations.json'),
      JSON.stringify({ version: 1, conversations: options.conversations }),
      'utf-8',
    )
  }
  writeLaunchState(dataDirectory, workspace, options)

  const app = await electron.launch({
    args: [APP_DIR, '--lang=en-US', `--user-data-dir=${join(dataDirectory, 'chromium')}`],
    cwd: APP_DIR,
    env: { ...process.env, ALPHA_DATA_DIR: dataDirectory, NODE_ENV: 'production', ...options.env },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('#root > *')
  if (options.resize !== false) await sizeWindow(app, window, 1440, 900)
  return { app, window, dataDirectory, workspace }
}

/**
 * The window's size is the window's, not the page's. Playwright's `setViewportSize` overrides the
 * page's own metrics and leaves the `BrowserWindow` exactly as Electron made it, so a spec that
 * "sets 1440x900" that way leaves the workbench laid out for a window it does not have — and what a
 * person watching the run sees is the app's own three drawn past the window's right edge and the
 * composer below its bottom. Measured before this existed: the page 1440x900, the window 1200x800.
 *
 * So the resize is asked of the window, and the page is waited for — the renderer takes a moment to
 * hear about it. A size under the app's own floor (`minWidth` 1024, `minHeight` 720) lowers the
 * floor for that window and no other: a browser may show the workbench at any size (ADR-0009), and
 * the specs that ask for one are about exactly that. A size the display cannot hold — the 2400-wide
 * probe on a 1280-wide runner — falls back to the metric override, because the alternative is a
 * suite that only passes on large monitors; that fallback says itself out loud rather than passing
 * quietly. A window that fails to take a size the display *can* hold is not tolerated: that is this
 * bug coming back, and it fails here naming both numbers.
 */
export async function sizeWindow(app: ElectronApplication, window: Page, width: number, height: number): Promise<void> {
  const holdable = await app.evaluate(
    ({ screen }, size) => {
      const work = screen.getPrimaryDisplay().workAreaSize
      return work.width >= size.width && work.height >= size.height
    },
    { width, height },
  )

  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const target = BrowserWindow.getAllWindows()[0]
      if (target === undefined) return
      const [minWidth, minHeight] = target.getMinimumSize()
      if (minWidth > size.width || minHeight > size.height) {
        target.setMinimumSize(Math.min(minWidth, size.width), Math.min(minHeight, size.height))
      }
      target.setContentSize(size.width, size.height)
    },
    { width, height },
  )

  try {
    await expect
      .poll(() => window.evaluate(() => [globalThis.innerWidth, globalThis.innerHeight]), { timeout: 3_000 })
      .toEqual([width, height])
  } catch {
    if (!holdable) {
      console.log(`the display cannot hold ${width}x${height}: the page is emulated at that size instead`)
      await window.setViewportSize({ width, height })
      return
    }
    const bounds = await app.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows()[0]
      return target === undefined ? null : target.getContentBounds()
    })
    throw new Error(
      `the window is ${bounds?.width ?? '?'}x${bounds?.height ?? '?'} while the page was asked for ` +
        `${width}x${height}: sizeWindow has to resize the window, because a page laid out for a size ` +
        'its window does not have is what a person sees as content pushed off the edge',
    )
  }
}

/**
 * The scripted MCP server as a definition this machine can run: the fixture in `@alpha/mcp` is a
 * real server, so the spec drives the real client rather than a stand-in for it.
 */
export function scriptedMcp(name: string, extra: { command?: string; env?: Record<string, string> } = {}): unknown {
  return {
    name,
    command: extra.command ?? process.execPath,
    args: ['--experimental-strip-types', join(process.cwd(), 'packages', 'mcp', 'src', 'scripted-server.ts')],
    env: { SCRIPTED_MCP_NAME: `${name}-`, ...extra.env },
  }
}

/** The one way every spec speaks: fill the composer and press Enter. */
export async function ask(window: Page, text: string): Promise<void> {
  const composer = window.getByRole('textbox', { name: 'Message the agent' })
  await composer.fill(text)
  await composer.press('Enter')
}
