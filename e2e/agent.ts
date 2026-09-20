/**
 * The agent the workbench runs in these tests: the scripted stand-in in `tools/scripted-agent/`,
 * which speaks pi's RPC protocol, keeps a real session file, and asks Alpha's gate before a tool
 * call (docs/constraints/04-testing.md C4.3). Alpha ships no agent, so pointing the workbench at
 * one is a setting like any other — a spec spreads `scriptedAgent` into its `workbench-state.json`
 * the way a person would set the path, and scripts the answers through the environment
 * (`ALPHA_FAUX_REPLIES`, with the two pacing variables when a turn must be catchable mid-stream),
 * which reaches the agent because the process Alpha spawns inherits the one the app launched with.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Where the workbench lives: one package under apps/, and every spec launches its built bundle. */
export const APP_DIR = join(process.cwd(), 'apps', 'desktop')

export const SCRIPTED_AGENT = join(process.cwd(), 'tools/scripted-agent/pi.mjs')

/** The settings fragment that makes the workbench run that agent. */
export const scriptedAgent = { agent: { path: SCRIPTED_AGENT } }

/**
 * A connection for the conversation to run on, with a key for it. A turn is refused before the
 * agent is asked unless Alpha knows a model and holds a key (#114), so a spec that asks for a turn
 * writes both files. The key is a plaintext vault entry — the workbench only ever hands it to the
 * agent's environment, and the stand-in dials nobody — and the base URL is an example host for the
 * same reason.
 */
export function configureProvider(
  dataDirectory: string,
  options: { id?: string; images?: boolean; models?: unknown[] } = {},
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
        { id, name: 'Scripted', api: 'openai-completions', baseUrl: 'https://llm.internal.example/v1', models: model },
      ],
    }),
    'utf-8',
  )
  writeFileSync(
    join(dataDirectory, 'credentials.json'),
    JSON.stringify({
      version: 1,
      entries: [{ providerId: id, protection: 'plaintext', payload: 'a key the stand-in never dials with' }],
    }),
    'utf-8',
  )
}
