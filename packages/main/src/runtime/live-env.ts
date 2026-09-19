/**
 * The live test's environment, in one place (C4.4): it runs only when `ALPHA_LIVE_TEST=1` and it
 * reads its endpoint, key and model from the environment. No credential is committed, and the
 * default test run makes no network request.
 */

import type { Absent } from '@alpha/core'

export interface LiveEnv {
  baseUrl: string
  apiKey: string
  model: string
  api: 'openai-completions' | 'anthropic-messages'
}

/** Returns undefined, with the reason printed, when the live test is not configured. */
export function requireLiveEnv(env: NodeJS.ProcessEnv, log: (message: string) => void): Absent<LiveEnv> {
  if (env.ALPHA_LIVE_TEST !== '1') {
    log('[live] skipped: set ALPHA_LIVE_TEST=1 to run it against a real provider.')
    return undefined
  }
  const baseUrl = env.ALPHA_LIVE_BASE_URL ?? ''
  const apiKey = env.ALPHA_LIVE_API_KEY ?? ''
  const model = env.ALPHA_LIVE_MODEL ?? ''
  const missing = [
    baseUrl === '' ? 'ALPHA_LIVE_BASE_URL' : '',
    apiKey === '' ? 'ALPHA_LIVE_API_KEY' : '',
    model === '' ? 'ALPHA_LIVE_MODEL' : '',
  ].filter((name) => name !== '')
  if (missing.length > 0) {
    log(`[live] skipped: ${missing.join(', ')} must be set as well.`)
    return undefined
  }
  return {
    baseUrl,
    apiKey,
    model,
    api: env.ALPHA_LIVE_API === 'anthropic-messages' ? 'anthropic-messages' : 'openai-completions',
  }
}
