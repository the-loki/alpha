/**
 * The provider catalog: where the popular endpoints live and which wire protocol they speak.
 *
 * Deliberately no model ids. A catalog that ships a stale model list is worse than one that
 * ships none, so the models come from the provider itself — `pi-ai`'s built-in catalogs for the
 * ids below, or whatever the user types for a custom endpoint.
 *
 * This is the one module allowed to contain provider hosts
 * (docs/constraints/03-product-scope.md C3.1).
 */
import type { ProviderApi } from '../providers.ts'

export interface CatalogEntry {
  id: string
  name: string
  api: ProviderApi
  baseUrl: string
  /** What to tell the user about the key, in their provider's own words. */
  keyHint: string
}

export const PROVIDER_CATALOG: CatalogEntry[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    keyHint: 'Starts with sk-ant-',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    api: 'openai-completions',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: 'Starts with sk-',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    api: 'openai-completions',
    baseUrl: 'https://api.deepseek.com',
    keyHint: 'From the DeepSeek console',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    api: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyHint: 'Starts with sk-or-',
  },
  {
    id: 'groq',
    name: 'Groq',
    api: 'openai-completions',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyHint: 'Starts with gsk_',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    api: 'openai-completions',
    baseUrl: 'https://api.mistral.ai/v1',
    keyHint: 'From the Mistral console',
  },
  {
    id: 'xai',
    name: 'xAI',
    api: 'openai-completions',
    baseUrl: 'https://api.x.ai/v1',
    keyHint: 'Starts with xai-',
  },
]

export function catalogEntry(id: string): CatalogEntry {
  const entry = PROVIDER_CATALOG.find((candidate) => candidate.id === id)
  if (entry === undefined) throw new Error(`No catalog entry ${id}`)
  return entry
}
