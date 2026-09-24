import { describe, expect, it } from 'vitest'
import { chainAfterRunVerdicts, chainToolVerdicts } from './compose.ts'
import type { AfterRunHook, AfterRunOutcome, BeforeToolCallHook } from './faces.ts'

const call = { toolCallId: 'call-1', toolName: 'bash', args: { command: 'ls' } }

const FAILURE: AfterRunOutcome = { failed: { message: 'the provider hung up' }, aborted: false }
const ABORT: AfterRunOutcome = { failed: undefined, aborted: true }

describe('[plugin] the beforeToolCall chain', () => {
  it('passes a call no hook blocks', async () => {
    const asked: string[] = []
    const first: BeforeToolCallHook = async () => {
      asked.push('first')
      return undefined
    }
    const second: BeforeToolCallHook = async () => {
      asked.push('second')
      return undefined
    }

    expect(await chainToolVerdicts([first, second])(call)).toBeUndefined()
    expect(asked).toEqual(['first', 'second'])
  })

  it('lets the first blocking hook win, and never asks the ones behind it', async () => {
    const asked: string[] = []
    const blocked: BeforeToolCallHook = async () => {
      asked.push('blocked')
      return { block: { reason: 'plan mode says no' } }
    }
    const behind: BeforeToolCallHook = async () => {
      asked.push('behind')
      return undefined
    }

    const verdict = await chainToolVerdicts([blocked, behind])(call)

    expect(verdict?.block?.reason).toBe('plan mode says no')
    expect(asked).toEqual(['blocked'])
  })

  it('asks the hooks in the order they were assembled', async () => {
    const asked: string[] = []
    const naming =
      (name: string, block: boolean): BeforeToolCallHook =>
      async () => {
        asked.push(name)
        return block ? { block: { reason: `${name} blocked it` } } : undefined
      }

    const verdict = await chainToolVerdicts([naming('first', false), naming('second', true), naming('third', false)])(
      call,
    )

    expect(verdict?.block?.reason).toBe('second blocked it')
    expect(asked).toEqual(['first', 'second'])
  })

  it('carries the call through to every hook unchanged', async () => {
    const seen: unknown[] = []
    const look: BeforeToolCallHook = async (asked) => {
      seen.push(asked)
      return undefined
    }

    await chainToolVerdicts([look])(call)

    expect(seen).toEqual([call])
  })

  it('is a pass when there is no hook at all', async () => {
    expect(await chainToolVerdicts([])(call)).toBeUndefined()
  })
})

describe('[plugin] the afterRun chain', () => {
  it('asks every hook in assembly order, and a retry behind another is still heard', async () => {
    const asked: string[] = []
    const naming =
      (name: string, retry: boolean): AfterRunHook =>
      async () => {
        asked.push(name)
        return retry ? { retry: true } : undefined
      }

    const verdict = await chainAfterRunVerdicts([naming('first', true), naming('second', false)])(FAILURE)

    expect(verdict?.retry).toBe(true)
    expect(asked).toEqual(['first', 'second'])
  })

  it('no hook asking for a retry is no verdict', async () => {
    const silent: AfterRunHook = async () => undefined

    expect(await chainAfterRunVerdicts([silent, silent])(FAILURE)).toBeUndefined()
  })

  it('an aborted run is shown to every hook and is never retried', async () => {
    const asked: string[] = []
    const eager: AfterRunHook = async (outcome) => {
      asked.push(outcome.aborted ? 'aborted' : 'failed')
      return { retry: true }
    }

    expect(await chainAfterRunVerdicts([eager])(ABORT)).toBeUndefined()
    expect(asked).toEqual(['aborted'])
    expect(await chainAfterRunVerdicts([eager])(FAILURE)).toEqual({ retry: true })
  })

  it('carries the outcome through to every hook unchanged', async () => {
    const seen: AfterRunOutcome[] = []
    const look: AfterRunHook = async (outcome) => {
      seen.push(outcome)
      return undefined
    }

    await chainAfterRunVerdicts([look, look])(FAILURE)

    expect(seen).toEqual([FAILURE, FAILURE])
  })

  it('is a pass when there is no hook at all', async () => {
    expect(await chainAfterRunVerdicts([])(FAILURE)).toBeUndefined()
  })
})
