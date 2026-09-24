import { scriptedModels } from '@alpha/agent/testing'
import { SessionStore } from '@alpha/sessions'
import { describe, expect, it } from 'vitest'
import { createCompactionPlugin } from './compaction-plugin.ts'

describe('compaction after a failed run', () => {
  it('leaves a failed attempt alone until the retry decision is made', async () => {
    let reads = 0
    const plugin = createCompactionPlugin({
      conversationId: 'c1',
      workspacePath: '/workspace',
      sessionId: () => 'c1',
      store: new SessionStore('/unused'),
      models: scriptedModels([]),
      agent: () => {
        reads += 1
        return undefined
      },
      model: () => undefined,
      onCompacted: () => undefined,
    })

    await plugin.afterRun({ failed: { message: 'try again' }, aborted: false })
    expect(reads).toBe(0)
  })
})
