import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import { launchWorkbench } from './agent'

const REPO_ROOT = process.cwd()
const SHOT_DIR = join(REPO_ROOT, 'test-results')

async function launch(dataDirectory?: string) {
  const {
    app,
    window,
    dataDirectory: directory,
    workspace,
  } = await launchWorkbench({
    provider: false,
    dataDirectory,
    resize: false,
  })
  return { app, window, directory, workspace }
}

async function openSettings(window: Page, tab: string) {
  // The strip hides the settings command while settings is open, so a second call only changes tab.
  const settingsLink = window.getByRole('link', { name: 'Settings' })
  if ((await settingsLink.count()) > 0) await settingsLink.click()
  await window.getByRole('link', { name: tab, exact: true }).click()
}

/** A connection is described by hand: there is no catalog to pick one from. */
async function describeProvider(window: Page, options: { id: string; baseUrl: string; name?: string }) {
  await window.getByRole('textbox', { name: 'Id', exact: true }).fill(options.id)
  if (options.name !== undefined) {
    await window.getByRole('textbox', { name: 'Name', exact: true }).fill(options.name)
  }
  await window.getByRole('textbox', { name: 'Base URL', exact: true }).fill(options.baseUrl)
  await window.getByRole('button', { name: 'Add a provider' }).click()
}

/** One model on the models panel, in the box for the given provider: the row just added. */
async function addModel(
  window: Page,
  provider: string,
  model: { id: string; name?: string; context?: string; max?: string; reasoning?: boolean },
) {
  const box = window.getByRole('region', { name: provider })
  await box.getByRole('button', { name: 'Add model' }).click()
  // The rows are positional, and a model is always added at the end of them.
  await box.getByRole('textbox', { name: 'Model id', exact: true }).last().fill(model.id)
  if (model.name !== undefined)
    await box.getByRole('textbox', { name: 'Display name', exact: true }).last().fill(model.name)
  if (model.context !== undefined) {
    await box.getByRole('textbox', { name: 'Context window', exact: true }).last().fill(model.context)
  }
  if (model.max !== undefined)
    await box.getByRole('textbox', { name: 'Max output', exact: true }).last().fill(model.max)
  if (model.reasoning === true)
    await box.getByRole('checkbox', { name: 'Thinks before answering', exact: true }).last().check()
  await box.getByRole('button', { name: 'Save models' }).click()
}

/** The card for one provider on the providers panel. */
const card = (window: Page, name: string) => window.locator('li').filter({ hasText: name })

test('a connection is described by hand, given a key, and deleted', async () => {
  const { app, window, directory } = await launch()
  await openSettings(window, 'Providers')

  await describeProvider(window, {
    id: 'internal-llm',
    name: 'Internal LLM',
    baseUrl: 'https://llm.internal.example/v1',
  })
  await expect(window.getByText('Internal LLM', { exact: true })).toBeVisible()
  await expect(window.getByText('no key', { exact: true })).toBeVisible()
  // A connection alone says what it speaks, and how many models travel over it — none, yet.
  await expect(card(window, 'Internal LLM').getByText('OpenAI Chat Completions')).toBeVisible()
  await expect(card(window, 'Internal LLM').getByText('0 models')).toBeVisible()

  await window.getByLabel('API key for Internal LLM').fill('sk-test-not-a-real-key')
  await window.getByRole('button', { name: 'Save key' }).click()
  await expect(window.getByText('key stored', { exact: true })).toBeVisible()

  // The key travelled one way, and the vault tells the truth about how it is protected: sealed
  // when the OS offers a keychain, plaintext (and said so in the UI) when it does not.
  const vault = JSON.parse(readFileSync(join(directory, 'credentials.json'), 'utf-8'))
  const protection = vault.entries[0].protection
  if (protection === 'os') {
    expect(JSON.stringify(vault)).not.toContain('sk-test-not-a-real-key')
    await expect(window.getByText(/no keychain/)).toBeHidden()
  } else {
    await expect(window.getByText(/no keychain/)).toBeVisible()
  }

  await window.screenshot({ path: join(SHOT_DIR, 'settings-provider.png') })

  await window.getByRole('button', { name: 'Delete' }).click()
  await expect(window.getByText('No providers yet.')).toBeVisible()
  await app.close()
})

test('a connection that was not filled in is refused, naming what is missing', async () => {
  const { app, window } = await launch()
  await openSettings(window, 'Providers')

  await window.getByRole('button', { name: 'Add a provider' }).click()
  await expect(window.getByText(/the id must be/i)).toBeVisible()

  await window.getByRole('textbox', { name: 'Id', exact: true }).fill('local-endpoint')
  await window.getByRole('textbox', { name: 'Base URL', exact: true }).fill('ftp://example.com')
  await window.getByRole('button', { name: 'Add a provider' }).click()
  await expect(window.getByText(/must be an http/i)).toBeVisible()

  await app.close()
})

test('the protocol is chosen from the three Alpha speaks, and it is what gets stored', async () => {
  const { app, window, directory } = await launch()
  await openSettings(window, 'Providers')

  // The three, by the names their own documentation uses, and the line that says who speaks it.
  await expect(window.getByLabel('Wire protocol').locator('option')).toHaveText([
    'OpenAI Chat Completions',
    'OpenAI Responses',
    'Anthropic Messages',
  ])
  await window.getByLabel('Wire protocol').selectOption('openai-responses')
  await expect(window.getByText(/goes to \/responses/)).toBeVisible()

  // The line says where the wire's request lands, because that is what decides the base url: this
  // one's client adds /v1/messages itself, so a base url carrying a /v1 of its own is read by
  // nobody. (Both languages are pinned in the dictionary's own test; this is the window's half.)
  await window.getByLabel('Wire protocol').selectOption('anthropic-messages')
  await expect(window.getByText(/reaches \/v1\/v1\/messages/)).toBeVisible()

  // What the key rides in, and when to change it: the default is the wire's own header, and Bearer
  // is for the endpoints that take only Authorization.
  await expect(window.getByLabel('API key sent as').locator('option')).toHaveText([
    'The header the wire uses',
    'Bearer token (Authorization)',
  ])
  await expect(window.getByText(/x-api-key on the Anthropic wire/)).toBeVisible()

  await window.getByLabel('Wire protocol').selectOption('openai-responses')
  await describeProvider(window, { id: 'gpt-endpoint', baseUrl: 'https://api.internal.example/v1' })
  const stored = JSON.parse(readFileSync(join(directory, 'providers.json'), 'utf-8'))
  expect(stored.providers).toEqual([
    {
      id: 'gpt-endpoint',
      name: 'gpt-endpoint',
      api: 'openai-responses',
      baseUrl: 'https://api.internal.example/v1',
      authStyle: 'api-key',
      models: [],
    },
  ])
  await app.close()
})

test('the models a connection serves are a setting of their own', async () => {
  const { app, window, directory } = await launch()
  await openSettings(window, 'Providers')
  await describeProvider(window, { id: 'local-endpoint', name: 'Local', baseUrl: 'https://llm.internal.example/v1' })

  // Nothing to send a request to yet, and the card's model sub-list is what says so.
  await expect(window.getByText('No models yet. Add the ones this provider serves.')).toBeVisible()

  await addModel(window, 'Local', { id: 'local-7b', context: '64000', max: '4096' })
  await addModel(window, 'Local', { id: 'local-70b', name: 'Local 70B', reasoning: true })

  const stored = JSON.parse(readFileSync(join(directory, 'providers.json'), 'utf-8'))
  expect(stored.providers[0].models).toEqual([
    { id: 'local-7b', name: 'local-7b', contextWindow: 64000, maxTokens: 4096, reasoning: false, images: false },
    { id: 'local-70b', name: 'Local 70B', contextWindow: 128000, maxTokens: 8192, reasoning: true, images: false },
  ])

  // The default model is a choice among exactly those, and it is written down where it was made.
  const picker = window.getByLabel('New conversations start on')
  await expect(picker.locator('option')).toHaveText(['The first model there is', 'local-7b', 'Local 70B'])
  await picker.selectOption('local-endpoint::local-70b')
  expect(JSON.parse(readFileSync(join(directory, 'providers.json'), 'utf-8')).defaultModel).toEqual({
    providerId: 'local-endpoint',
    modelId: 'local-70b',
  })

  await window.screenshot({ path: join(SHOT_DIR, 'settings-models.png') })
  await app.close()
})

test('whether a model takes pictures is a setting of its own', async () => {
  const { app, window, directory } = await launch()
  await openSettings(window, 'Providers')
  await describeProvider(window, { id: 'local-endpoint', name: 'Local', baseUrl: 'https://llm.internal.example/v1' })
  await addModel(window, 'Local', { id: 'local-7b', context: '64000', max: '4096' })

  // Off unless it is said: the app ships no catalog, so nothing here knows what the endpoint
  // behind a model id can read (ADR-0018).
  const saved = () => JSON.parse(readFileSync(join(directory, 'providers.json'), 'utf-8')).providers[0].models[0].images
  expect(saved()).toBe(false)

  await window.getByRole('region', { name: 'Local' }).getByRole('checkbox', { name: 'Takes pictures' }).check()
  await window.getByRole('button', { name: 'Save models' }).click()
  await expect.poll(saved).toBe(true)

  // The row keeps its state on screen: the tick is stored with the model, not with the window.
  await expect(window.getByRole('checkbox', { name: 'Takes pictures' })).toBeChecked()
  await app.close()
})

test('a connection with no key says so, and survives a relaunch', async () => {
  const { app, window, directory } = await launch()
  await openSettings(window, 'Providers')
  await describeProvider(window, { id: 'unkeyed', baseUrl: 'https://llm.internal.example/v1' })
  await expect(window.getByText('no key', { exact: true })).toBeVisible()
  await app.close()

  const reopened = await launch(directory)
  await reopened.window.getByRole('link', { name: 'Settings' }).click()
  await expect(reopened.window.getByText('unkeyed', { exact: true })).toBeVisible()
  await reopened.app.close()
})
