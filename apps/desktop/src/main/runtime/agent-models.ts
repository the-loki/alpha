/**
 * What the agent is told about the models Alpha knows — and what it is never told.
 *
 * Alpha stays the only place a key is typed and the only place it is stored, encrypted. The agent
 * gets a `models.json` in Alpha's own agent directory describing the provider Alpha has (base URL,
 * wire protocol, model ids) with the credential *named* rather than written, and the value itself
 * only in the child's environment. Nothing here puts a secret in a file, and nothing hands one to
 * the window.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StoredProvider, Undef } from '@alpha/core'
import type { ProviderStore } from '../providers/store.ts'

/** The file the agent reads, and the field names pi expects inside it. */
export const MODELS_FILE = 'models.json'

/**
 * The environment variable a provider's credential travels in, derived from the provider's id so
 * both sides of the spawn agree without a table.
 */
export const credentialVariable = (providerId: string): string =>
  `ALPHA_ADAPTER_KEY_${providerId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`

/** The models the agent may run: everything the person configured, minus everything secret. */
function configOf(providers: StoredProvider[]): string {
  const configured = providers
    .filter((provider) => provider.models.length > 0)
    .map((provider) => [
      provider.id,
      {
        baseUrl: provider.baseUrl,
        api: provider.api,
        apiKey: `$${credentialVariable(provider.id)}`,
        models: provider.models.map((model) => ({
          id: model.id,
          name: model.name,
          reasoning: model.reasoning,
          input: model.images ? ['text', 'image'] : ['text'],
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        })),
      },
    ])
  return JSON.stringify({ providers: Object.fromEntries(configured) }, null, 2)
}

/**
 * Writes what the agent needs to dial the person's providers. It is written every time rather than
 * when it changes: it is small, and a stale one would offer a provider the person has removed.
 */
export function writeModelsFile(store: ProviderStore, agentDirectory: string): void {
  mkdirSync(agentDirectory, { recursive: true })
  writeFileSync(join(agentDirectory, MODELS_FILE), configOf(store.list()), 'utf-8')
}

/** How a credential failed to be read, in the person's terms rather than the vault's. */
export interface CredentialProblem {
  message: string
}

/**
 * The credential for one provider, in the only shape that may leave Alpha: an environment variable
 * name and its value. A credential that cannot be read is a refusal before the agent is asked to
 * run at all, because a run that fails at the first token is a worse answer than a sentence.
 */
export function credentialFor(
  store: ProviderStore,
  providerId: string,
): { env: NodeJS.ProcessEnv; problem?: CredentialProblem } {
  if (store.find(providerId) === undefined) {
    return { env: {}, problem: { message: `Alpha has no provider called ${providerId}.` } }
  }
  let secret: Undef<string>
  try {
    secret = store.credential(providerId)
  } catch {
    return {
      env: {},
      problem: { message: `Alpha could not read the key for ${providerId}. Enter it again under Settings, Providers.` },
    }
  }
  if (secret === undefined || secret === '') {
    return { env: {}, problem: { message: `Alpha has no key for ${providerId}. Add one under Settings, Providers.` } }
  }
  return { env: { [credentialVariable(providerId)]: secret } }
}
