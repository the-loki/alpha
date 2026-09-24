import type { AfterRunOutcome } from '@alpha/plugin'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import { runAfterRunHooks } from './after-run.ts'
import { assembleAgent } from './assemble-agent.ts'
import type { AlphaPlugin } from './plugin-contract.ts'
import { aModel, errorStream, scriptedModels, textStream } from './scripted-provider.ts'

/** The transcript's last assistant message, or nothing when the run never produced one. */
const lastAssistantOf = (messages: AgentMessage[]): AssistantMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant') return message
  }
  return undefined
}

/** The plugin that records every outcome it is shown, in the order it is asked. */
const observing = (name: string, seen: string[]): AlphaPlugin => ({
  name,
  afterRun: async (outcome) => {
    seen.push(`${name}:${outcome.failed?.message ?? 'clean'}${outcome.aborted ? ':aborted' : ''}`)
    return undefined
  },
})

describe('driving the afterRun hooks', () => {
  it('a hook asking to retry after a failed run drives exactly one continue, then stops', async () => {
    let drives = 0
    const models = scriptedModels([
      () => {
        drives += 1
        return errorStream('transient boom', 'error')
      },
      () => {
        drives += 1
        return textStream('recovered')
      },
    ])
    const outcomes: AfterRunOutcome[] = []
    const retryOnce: AlphaPlugin = {
      name: 'retry-once',
      afterRun: async (outcome) => {
        outcomes.push(outcome)
        return outcome.failed === undefined ? undefined : { retry: true }
      },
    }
    const seen: string[] = []
    const plugins = [retryOnce, observing('observer', seen)]
    const agent = assembleAgent({ models, model: aModel(), plugins, systemPrompt: 's' })
    // Called before the prompt resolves: waiting the run out is the helper's job, not the caller's.
    const running = agent.prompt('hello')
    const driven = runAfterRunHooks(agent, plugins)
    await running
    expect(await driven).toEqual({ failed: undefined, aborted: false })
    expect(drives).toBe(2)
    expect(outcomes).toEqual([
      { failed: { message: 'transient boom' }, aborted: false },
      { failed: undefined, aborted: false },
    ])
    expect(seen).toEqual(['observer:transient boom', 'observer:clean'])
    expect(lastAssistantOf(agent.state.messages)?.content[0]).toMatchObject({ type: 'text', text: 'recovered' })
  })

  it('an aborted run is observed but never retried', async () => {
    let drives = 0
    const models = scriptedModels([
      () => {
        drives += 1
        return errorStream('stopped by the person', 'aborted')
      },
    ])
    const outcomes: AfterRunOutcome[] = []
    const alwaysRetry: AlphaPlugin = {
      name: 'eager',
      afterRun: async (outcome) => {
        outcomes.push(outcome)
        return { retry: true }
      },
    }
    const agent = assembleAgent({ models, model: aModel(), plugins: [alwaysRetry], systemPrompt: 's' })
    await agent.prompt('hello')
    await runAfterRunHooks(agent, [alwaysRetry])
    expect(drives).toBe(1)
    expect(outcomes).toEqual([{ failed: undefined, aborted: true }])
  })

  it('does not continue after Stop even if a delayed hook still asks for a retry', async () => {
    let drives = 0
    const models = scriptedModels([
      () => {
        drives += 1
        return errorStream('temporary failure', 'error')
      },
      () => {
        drives += 1
        return textStream('too late')
      },
    ])
    let enter!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const delayed: AlphaPlugin = {
      name: 'delayed-retry',
      afterRun: async () => {
        enter()
        await held
        return { retry: true }
      },
    }
    const agent = assembleAgent({ models, model: aModel(), plugins: [delayed], systemPrompt: 's' })
    const stop = new AbortController()
    await agent.prompt('hello')
    const driving = runAfterRunHooks(agent, [delayed], undefined, stop.signal)
    await entered
    stop.abort()
    release()

    expect(await driving).toEqual({ failed: undefined, aborted: true })
    expect(drives).toBe(1)
  })

  it('hooks are asked in assembly order and a clean run asks for no retry', async () => {
    const models = scriptedModels([() => textStream('fine')])
    const seen: string[] = []
    const plugins = [observing('first', seen), observing('second', seen)]
    const agent = assembleAgent({ models, model: aModel(), plugins, systemPrompt: 's' })
    await agent.prompt('hello')
    await runAfterRunHooks(agent, plugins)
    expect(seen).toEqual(['first:clean', 'second:clean'])
  })
})
