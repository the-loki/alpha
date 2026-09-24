/**
 * MCP servers, configured in the window rather than in a file by hand: the settings page lists
 * what the workbench reaches, says how each one went, and takes a change without a restart.
 *
 * The server the spec adds is the real one: `packages/mcp/src/scripted-server.ts` runs as a child
 * process of the real workbench, over the real client, so what is exercised is the path a person's
 * own server takes. What is scripted is the model, as everywhere else (C4.3).
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { chromium, expect, type Page, test } from '@playwright/test'
import { ask, launchWorkbench, scriptedMcp } from './agent'

/** Every server the workbench is written down as having, read from the file the panel owns. */
function storedServers(dataDirectory: string): { name: string }[] {
  const file = join(dataDirectory, 'mcp.json')
  return (JSON.parse(readFileSync(file, 'utf-8')) as { servers: { name: string }[] }).servers
}

async function openSettings(window: Page, tab: string): Promise<void> {
  const settingsLink = window.getByRole('link', { name: 'Settings' })
  if ((await settingsLink.count()) > 0) await settingsLink.click()
  await window.getByRole('link', { name: tab, exact: true }).click()
}

/** The card of one server, found by the name it carries as its own attribute. */
function card(window: Page, name: string) {
  return window.locator(`[data-server="${name}"]`)
}

async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const address = probe.address()
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  if (typeof address !== 'object' || address === null) throw new Error('No free port')
  return address.port
}

test('configures an MCP server in the window, and reaches it without a restart', async () => {
  const { app, window, dataDirectory } = await launchWorkbench({ provider: false, resize: false })
  await openSettings(window, 'MCP servers')

  // Nothing configured yet: the panel says so and offers the form.
  await expect(window.getByText('No MCP servers yet. Add the one you want the agent to reach.')).toBeVisible()

  await fillServerForm(window, { name: 'scripted' })
  await window.getByRole('button', { name: 'Add an MCP server' }).click()

  // The fixture offers five tools, and the count in the card is how a person sees it was reached.
  await expect(card(window, 'scripted').getByText('5 tools')).toBeVisible()
  // Written where the next launch reads it, which is the panel's half of the promise.
  expect(storedServers(dataDirectory).map((server) => server.name)).toEqual(['scripted'])

  // Editing what a server is reached by is a save, not a delete and an add: the row stays.
  await card(window, 'scripted').getByRole('textbox', { name: 'Command' }).fill('a-command-that-is-not-there')
  await card(window, 'scripted').getByRole('button', { name: 'Save' }).click()
  await expect(card(window, 'scripted').getByText('Not reached')).toBeVisible()
  await expect(card(window, 'scripted').getByText(/a-command-that-is-not-there/)).toBeVisible()
  // Reconnect is offered exactly where it does something, and pressing it tries again.
  await card(window, 'scripted').getByRole('button', { name: 'Reconnect' }).click()
  await expect(card(window, 'scripted').getByText('Not reached')).toBeVisible()

  // Put the command back, so what the next launch reads is a server that works.
  await card(window, 'scripted').getByRole('textbox', { name: 'Command' }).fill(process.execPath)
  await card(window, 'scripted').getByRole('button', { name: 'Save' }).click()
  await expect(card(window, 'scripted').getByText('5 tools')).toBeVisible()
  await app.close()

  // And the next launch has it, without anybody typing it again.
  const relaunched = await launchWorkbench({ provider: false, resize: false, dataDirectory })
  await openSettings(relaunched.window, 'MCP servers')
  await expect(card(relaunched.window, 'scripted').getByText('5 tools')).toBeVisible()
  await relaunched.app.close()
})

test('keeps the servers across a launch, and deletes one', async () => {
  const { app, window, dataDirectory } = await launchWorkbench({
    provider: false,
    resize: false,
    mcp: [scriptedMcp('scripted'), scriptedMcp('ghost', { command: 'nowhere' })],
  })
  await openSettings(window, 'MCP servers')

  // Both are there — one reached with its tools, one saying why it is not.
  await expect(card(window, 'scripted').getByText('5 tools')).toBeVisible()
  await expect(card(window, 'ghost').getByText('Not reached')).toBeVisible()
  await expect(card(window, 'ghost').getByText(/nowhere/)).toBeVisible()

  await card(window, 'ghost').getByRole('button', { name: 'Delete the ghost server' }).click()
  await expect(card(window, 'ghost')).toHaveCount(0)
  expect(storedServers(dataDirectory).map((server) => server.name)).toEqual(['scripted'])

  await app.close()
})

test('answers a real server form in the conversation and preserves its audit', async () => {
  const { app, window } = await launchWorkbench({
    level: 'full-access',
    replies: [{ tool: { name: 'mcp__scripted__reverse_answered', args: {} } }, 'The form was answered.'],
    mcp: [scriptedMcp('scripted', { env: { SCRIPTED_MCP_ELICITATION: '1' } })],
  })
  try {
    await ask(window, 'ask the server')
    const form = window.getByRole('form', { name: 'Server question' })
    await expect(form).toBeVisible()
    await expect(form.getByText('scripted')).toBeVisible()
    await form.getByRole('textbox', { name: 'Name' }).fill('Ada')
    await form.getByRole('button', { name: 'Send answer' }).click()
    await expect(form).toHaveCount(0)
    await expect(window.getByText('The form was answered.')).toBeVisible()
    await window.getByRole('tab', { name: 'Conversation' }).focus()
    await window.getByRole('tab', { name: 'Conversation' }).press('End')
    await expect(window.getByRole('tab', { name: 'MCP requests' })).toHaveAttribute('aria-selected', 'true')
    await expect(window.getByRole('tabpanel', { name: 'MCP requests' }).getByText('Ada')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('a narrow browser can cancel a real server form with Escape', async () => {
  const port = await freePort()
  const token = 'mcp-browser-token'
  const { app } = await launchWorkbench({
    level: 'full-access',
    network: { port, token },
    replies: [{ tool: { name: 'mcp__scripted__reverse_answered', args: {} } }, 'The server continued.'],
    mcp: [scriptedMcp('scripted', { env: { SCRIPTED_MCP_ELICITATION: '1' } })],
  })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
    await page.goto(`http://127.0.0.1:${port}`)
    await page.getByLabel('Access token').fill(token)
    await page.getByRole('button', { name: 'Open the workbench' }).click()
    await ask(page, 'ask the server')
    const form = page.getByRole('form', { name: 'Server question' })
    await expect(form).toBeVisible()
    await form.getByRole('textbox', { name: 'Name' }).press('Escape')
    await expect(form).toHaveCount(0)
    await expect(page.getByText('The server continued.')).toBeVisible()
    await page.getByRole('tab', { name: 'MCP requests' }).click()
    await expect(page.locator('[data-mcp-outcome="cancelled"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await browser.close()
    await app.close()
  }
})

test('reviews and shares a real server sampling request in the desktop conversation', async () => {
  const { app, window } = await launchWorkbench({
    level: 'full-access',
    replies: [
      { tool: { name: 'mcp__scripted__sample_answered', args: {} } },
      'Generated model answer',
      'The server received the answer.',
    ],
    mcp: [scriptedMcp('scripted', { env: { SCRIPTED_MCP_SAMPLING: '1' } })],
  })
  try {
    await ask(window, 'ask the server to sample')
    const request = window.getByRole('group', { name: 'Model request' })
    await expect(request).toBeVisible()
    await expect(request.getByText('scripted via mcp__scripted__sample_answered')).toBeVisible()
    await expect(request.getByText('Scripted / Scripted model')).toBeVisible()
    await expect(request.getByText('Up to 32 output tokens')).toBeVisible()
    const form = request.getByRole('form', { name: 'Model request' })
    await form.getByRole('textbox', { name: 'User message' }).fill('Edited for the server')
    await form.getByRole('button', { name: 'Generate' }).click()

    const review = request.getByRole('region', { name: 'Review response' })
    await expect(review.getByText('Generated model answer')).toBeVisible()
    await expect(review.getByText(/tokens used/)).toBeVisible()
    await review.getByRole('button', { name: 'Share with server' }).click()
    await expect(request).toHaveCount(0)
    await expect(window.getByText('The server received the answer.')).toBeVisible()
    await window.getByRole('tab', { name: 'MCP requests' }).click()
    const audit = window.locator('[data-mcp-outcome="accepted"]')
    await expect(audit.getByText('Edited for the server')).toBeVisible()
    await expect(audit.getByText('Generated model answer')).toBeVisible()
    await expect(audit.getByText(/tokens used/)).toBeVisible()
  } finally {
    await app.close()
  }
})

test('discards a sampled answer in the narrow browser without sharing it', async () => {
  const port = await freePort()
  const token = 'sampling-browser-token'
  const { app } = await launchWorkbench({
    level: 'full-access',
    network: { port, token },
    replies: [
      { tool: { name: 'mcp__scripted__sample_answered', args: {} } },
      'Private model answer',
      'The server continued without the answer.',
    ],
    mcp: [scriptedMcp('scripted', { env: { SCRIPTED_MCP_SAMPLING: '1' } })],
  })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
    await page.goto(`http://127.0.0.1:${port}`)
    await page.getByLabel('Access token').fill(token)
    await page.getByRole('button', { name: 'Open the workbench' }).click()
    await ask(page, 'ask the server to sample')
    const request = page.getByRole('group', { name: 'Model request' })
    await expect(request).toBeVisible()
    await request.getByRole('button', { name: 'Generate' }).click()
    const review = request.getByRole('region', { name: 'Review response' })
    await expect(review.getByText('Private model answer')).toBeVisible()
    await review.getByRole('button', { name: 'Discard response' }).click()
    await expect(request).toHaveCount(0)
    await expect(page.getByText('The server continued without the answer.')).toBeVisible()
    await page.getByRole('tab', { name: 'MCP requests' }).click()
    const audit = page.locator('[data-mcp-outcome="declined"]')
    await expect(audit.getByText('Server prompt').first()).toBeVisible()
    await expect(audit.getByText(/tokens used/)).toBeVisible()
    await expect(audit.getByText('Private model answer')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await browser.close()
    await app.close()
  }
})

test('says a server is being reached while it is, and why it was not when that ends', async () => {
  // The fixture keeps reading and never answers when it is muted, so this server is only ever a
  // server nobody has an outcome for yet — the state the panel has to show without lying about it.
  const { app, window } = await launchWorkbench({
    provider: false,
    resize: false,
    mcp: [scriptedMcp('sleepy', { env: { SCRIPTED_MCP_MUTED: '1' } })],
  })
  await openSettings(window, 'MCP servers')

  await expect(card(window, 'sleepy').getByText('Reaching it…')).toBeVisible()
  // And the panel asks again rather than staying there: the hub gives up on it, and the card says so.
  await expect(card(window, 'sleepy').getByText('Not reached')).toBeVisible({ timeout: 15_000 })

  await app.close()
})

/** The add form's boxes, which are the only place a server is named from. */
async function fillServerForm(window: Page, options: { name: string }): Promise<void> {
  const form = window.getByRole('region', { name: 'Add an MCP server' })
  await form.getByRole('textbox', { name: 'Name' }).fill(options.name)
  await form.getByRole('textbox', { name: 'Command' }).fill(process.execPath)
  await form
    .getByRole('textbox', { name: 'Arguments' })
    .fill(
      ['--experimental-strip-types', join(process.cwd(), 'packages', 'mcp', 'src', 'scripted-server.ts')].join('\n'),
    )
  await form.getByRole('textbox', { name: 'Environment' }).fill(`SCRIPTED_MCP_NAME=${options.name}-`)
}
