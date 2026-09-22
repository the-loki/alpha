import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'
import { runAfterRunHooks } from './after-run.ts'
import { failedMessageOf } from './agent-events.ts'
import { assembleAgent } from './assemble-agent.ts'
import type { AfterRunOutcome, AlphaPlugin } from './plugin-contract.ts'
import { createRetryPlugin } from './retry-plugin.ts'
import { aModel, errorStream, scriptedModels, textStream } from './scripted-provider.ts'

/** coding-agent's auto-retry (ADR-0025): a transient provider failure after a run retries with
 * backoff, a bounded number of times, and an abort never retries. The decision is pure and
 * inspectable; the attempt is taken — and counted — only inside `afterRun`. */

const FAILURE: AfterRunOutcome = { failed: 'the provider hung up', aborted: false }

describe('the auto-retry decision', () => {
  it('a failure with attempts to spend retries; an abort and a clean run never do', () => {
    const plugin = createRetryPlugin({ delays: [0, 0] })
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
    expect(plugin.shouldRetry({ failed: 'stopped by the person', aborted: true })).toBe(false)
    expect(plugin.shouldRetry({ failed: undefined, aborted: false })).toBe(false)
  })

  it('the decision is pure: asking it never spends an attempt', () => {
    const plugin = createRetryPlugin({ delays: [0] })
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
  })

  it('attempts run out: one delay means one retry, then the failure stands', async () => {
    const plugin = createRetryPlugin({ delays: [0] })
    // Asked before the retry plugin in the chain, the observer reads the very decision the
    // runtime's annotation reads — first a retry is planned, then the budget is spent.
    const decisions: boolean[] = []
    const observer: AlphaPlugin = {
      name: 'observer',
      afterRun: async () => {
        decisions.push(plugin.shouldRetry(FAILURE))
        return undefined
      },
    }
    const agent = assembleAgent({
      models: scriptedModels([() => errorStream('boom one', 'error'), () => errorStream('boom two', 'error')]),
      model: aModel(),
      plugins: [observer, plugin],
      systemPrompt: 's',
    })
    await agent.prompt('hello')
    await runAfterRunHooks(agent, [observer, plugin])

    expect(decisions).toEqual([true, false])
  })

  it('a run that ends clean hands the next run a whole budget again', async () => {
    const plugin = createRetryPlugin({ delays: [0] })
    const agent = assembleAgent({
      models: scriptedModels([() => errorStream('boom', 'error'), () => textStream('recovered')]),
      model: aModel(),
      plugins: [plugin],
      systemPrompt: 's',
    })
    await agent.prompt('hello')
    await runAfterRunHooks(agent, [plugin])

    expect(plugin.shouldRetry({ failed: undefined, aborted: false })).toBe(false)
    expect(plugin.shouldRetry(FAILURE)).toBe(true)
  })
})

describe('taking a retry', () => {
  it('afterRun sleeps this attempt’s backoff, then asks the base to continue', async () => {
    const plugin = createRetryPlugin({ delays: [30, 0] })
    const agent = assembleAgent({
      models: scriptedModels([() => errorStream('transient boom', 'error'), () => textStream('recovered')]),
      model: aModel(),
      plugins: [plugin],
      systemPrompt: 's',
    })
    const running = agent.prompt('hello')
    const driven = runAfterRunHooks(agent, [plugin])
    await running
    const startedAt = Date.now()
    await driven
    // The first attempt waits its delay; the second (unused here) would not have to.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25)
    expect(agent.state.messages.some((message) => JSON.stringify(message).includes('recovered'))).toBe(true)
    expect(agent.state.messages.some((message) => JSON.stringify(message).includes('transient boom'))).toBe(false)
  })

  it('drives through the cap: two failures with one delay end in the second failure', async () => {
    const plugin = createRetryPlugin({ delays: [0] })
    const agent = assembleAgent({
      models: scriptedModels([() => errorStream('boom one', 'error'), () => errorStream('boom two', 'error')]),
      model: aModel(),
      plugins: [plugin],
      systemPrompt: 's',
    })
    await agent.prompt('hello')
    await runAfterRunHooks(agent, [plugin])

    const last = agent.state.messages.at(-1)
    expect(last?.role === 'assistant' ? last.errorMessage : '').toBe('boom two')
  })
})

describe('reading the failure an agent_end carries', () => {
  it('the last assistant message saying error is the failure; anything else is not', () => {
    const failed: AgentMessage = {
      role: 'assistant',
      content: [],
      api: 'openai-completions',
      provider: 'p',
      model: 'm',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'error',
      errorMessage: 'the provider hung up',
      timestamp: 1,
    }
    expect(failedMessageOf({ type: 'agent_end', messages: [failed] })).toBe('the provider hung up')
    expect(failedMessageOf({ type: 'agent_end', messages: [] })).toBeUndefined()
    expect(failedMessageOf({ type: 'message_end', message: failed })).toBeUndefined()
  })
})
