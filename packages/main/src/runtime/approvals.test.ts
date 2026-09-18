import type { ApprovalAsk, RuntimeEvent } from '@alpha/core'
import { describe, expect, it } from 'vitest'
import { ApprovalBroker } from './approvals.ts'

const ask: ApprovalAsk = {
  callId: 'call-1',
  toolName: 'bash',
  risk: 'execute',
  summary: 'rm -rf build',
  raw: '{"command":"rm -rf build"}',
  cwd: '/dev/alpha',
  level: 'ask',
}

const broker = () => {
  const events: RuntimeEvent[] = []
  const instance = new ApprovalBroker({ emit: (event) => events.push(event) })
  return { instance, events }
}

const requested = (events: RuntimeEvent[]) => events.filter((event) => event.type === 'approval_requested')

describe('the approval broker', () => {
  it('emits a request with an identity the window can answer with', () => {
    const { instance, events } = broker()

    void instance.ask('c1', ask)

    const [event] = requested(events)
    expect(event?.type === 'approval_requested' && event.request.requestId).not.toBe('')
    expect(event?.type === 'approval_requested' && event.request.requestedAt).toBeGreaterThan(0)
    expect(event?.type === 'approval_requested' && event.request).toMatchObject({ callId: 'call-1', level: 'ask' })
  })

  it('resolves the waiting call when the user answers', async () => {
    const { instance, events } = broker()
    const waiting = instance.ask('c1', ask)
    const requestId = requested(events)[0]?.type === 'approval_requested' ? requested(events)[0].request.requestId : ''

    instance.answer('c1', requestId, { decision: 'once' })

    await expect(waiting).resolves.toEqual({ decision: 'once' })
  })

  it('tells the window the card is answered, so it can be taken down', async () => {
    const { instance, events } = broker()
    const waiting = instance.ask('c1', ask)
    const requestId = requested(events)[0]?.type === 'approval_requested' ? requested(events)[0].request.requestId : ''

    instance.answer('c1', requestId, { decision: 'always', scope: 'workspace' })

    const decided = events.find((event) => event.type === 'approval_decided')
    expect(decided).toMatchObject({
      conversationId: 'c1',
      requestId,
      callId: 'call-1',
      decision: 'always',
      scope: 'workspace',
    })
    await expect(waiting).resolves.toEqual({ decision: 'always', scope: 'workspace' })
  })

  it('keeps two waiting calls apart', async () => {
    const { instance, events } = broker()
    const first = instance.ask('c1', { ...ask, callId: 'call-1' })
    const second = instance.ask('c1', { ...ask, callId: 'call-2' })
    const ids = requested(events).map((event) => (event.type === 'approval_requested' ? event.request.requestId : ''))

    instance.answer('c1', ids[1], { decision: 'deny', reason: 'no' })

    await expect(second).resolves.toEqual({ decision: 'deny', reason: 'no' })
    expect(ids[0]).not.toBe(ids[1])
    instance.answer('c1', ids[0], { decision: 'once' })
    await expect(first).resolves.toEqual({ decision: 'once' })
  })

  it('ignores an answer for a request it never made', () => {
    const { instance } = broker()
    expect(() => instance.answer('c1', 'stranger', { decision: 'once' })).not.toThrow()
  })

  it('ignores an answer meant for another conversation', async () => {
    const { instance, events } = broker()
    const waiting = instance.ask('c1', ask)
    const requestId = requested(events)[0]?.type === 'approval_requested' ? requested(events)[0].request.requestId : ''

    instance.answer('c2', requestId, { decision: 'once' })
    instance.answer('c1', requestId, { decision: 'deny', reason: 'later' })

    await expect(waiting).resolves.toEqual({ decision: 'deny', reason: 'later' })
  })

  it('denies everything outstanding when the conversation goes away, so nothing hangs', async () => {
    const { instance } = broker()
    const waiting = instance.ask('c1', ask)

    instance.abandon('c1', 'The conversation was closed.')

    await expect(waiting).resolves.toEqual({ decision: 'deny', reason: 'The conversation was closed.' })
  })

  it('leaves the requests of another conversation alone when one is abandoned', async () => {
    const { instance, events } = broker()
    const kept = instance.ask('c2', ask)
    const dropped = instance.ask('c1', ask)
    const idFor = (conversationId: string): string => {
      const event = requested(events).find(
        (candidate) => candidate.type === 'approval_requested' && candidate.conversationId === conversationId,
      )
      return event?.type === 'approval_requested' ? event.request.requestId : ''
    }

    instance.abandon('c1', 'closed')

    await expect(dropped).resolves.toEqual({ decision: 'deny', reason: 'closed' })
    instance.answer('c2', idFor('c2'), { decision: 'once' })
    await expect(kept).resolves.toEqual({ decision: 'once' })
  })
})
