/**
 * The seam the suites test through: Alpha as launched for real, with a provider that answers from
 * a script. Alpha ships no agent of its own to stand in — the agent is embedded in its main
 * process, and the honest seam ends at the provider's wire — so the stand-in is an endpoint on
 * loopback (`startScriptedProvider`, in ./scripted-provider), and a spec points providers.json at
 * it the way a person points theirs at a host. The vault key stays a plaintext entry; the
 * endpoint never checks it, and no credential requirement is ever seen by anything in the test.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Where the workbench lives: one package under apps/, and every spec launches its built bundle. */
export const APP_DIR = join(process.cwd(), 'apps', 'desktop')

/**
 * A connection for the conversation to run on, with a key for it. A turn is refused before the
 * provider is asked unless Alpha knows a model and holds a key (#114), so a spec that asks for a
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
