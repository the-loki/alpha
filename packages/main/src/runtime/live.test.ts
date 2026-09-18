import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RuntimeEvent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { ConversationRuntime } from './conversation-runtime.ts'
import { resolveModelRuntime } from './models.ts'

/**
 * The one test that talks to a real model. It exists to prove the parts a scripted provider
 * cannot: that the provider client, the wire protocol, streaming, and usage reporting all work
 * against a live endpoint.
 *
 * It is skipped unless ALPHA_LIVE_TEST=1, and it takes its endpoint and key from the
 * environment, so no credential is ever committed and a normal test run makes no request
 * (docs/constraints/04-testing.md C4.4).
 */
const enabled = process.env.ALPHA_LIVE_TEST === '1'

if (!enabled) {
  console.log(
    '[live] skipped: set ALPHA_LIVE_TEST=1, plus ALPHA_LIVE_BASE_URL, ALPHA_LIVE_API_KEY and ALPHA_LIVE_MODEL, to run it.',
  )
}

const required = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value === '') throw new Error(`${name} is required for the live test`)
  return value
}

describe.skipIf(!enabled)('a real provider', () => {
  it('streams a reply and reports it as a finished message', async () => {
    const events: RuntimeEvent[] = []
    const modelRuntime = resolveModelRuntime({
      ALPHA_BASE_URL: required('ALPHA_LIVE_BASE_URL'),
      ALPHA_API_KEY: required('ALPHA_LIVE_API_KEY'),
      ALPHA_MODEL: required('ALPHA_LIVE_MODEL'),
      ALPHA_API: process.env.ALPHA_LIVE_API,
    })

    const { runtime } = await ConversationRuntime.open({
      workspacePath: mkdtempSync(join(tmpdir(), 'alpha-live-')),
      sessionsRoot: mkdtempSync(join(tmpdir(), 'alpha-live-sessions-')),
      modelRuntime,
      systemPrompt: 'Answer in three words or fewer.',
      emit: (event) => events.push(event),
    })

    await runtime.prompt('Say hello.')
    const transcript = await runtime.transcript()
    await runtime.close()

    const streamed = events
      .filter((event) => event.type === 'assistant_text_delta')
      .map((event) => event.delta)
      .join('')
    // A live failure is worth reading, so the reason travels with the assertion.
    const failure = events.find((event) => event.type === 'run_failed')

    expect(streamed.trim(), failure === undefined ? 'no text streamed' : `run failed: ${failure.message}`).not.toBe('')
    expect(transcript.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(transcript[1].status).toBe('complete')
    expect(transcript[1].blocks.length).toBeGreaterThan(0)
  }, 60_000)
})
