import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpExchange } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
import { McpExchangeLog } from './mcp-exchanges.ts'

const pending = (id: string, toolCallId = 'call-1'): McpExchange => ({
  id,
  server: 'files',
  method: 'elicitation/create',
  toolCallId,
  toolName: 'mcp__files__lookup',
  requestText: 'Name?',
  requestedAt: 100,
  outcome: 'pending',
})

describe('[sessions] MCP request audit', () => {
  it('persists decisions by conversation and recovers an interrupted request', () => {
    const data = mkdtempSync(join(tmpdir(), 'alpha-mcp-exchanges-'))
    const log = new McpExchangeLog(data)
    log.start('first', pending('one'))
    log.start('second', pending('two'))
    expect(new McpExchangeLog(data).list('first')).toEqual([pending('one')])
    expect(log.finish('first', 'one', 'accepted', 120, { name: 'Ada' })).toMatchObject({
      outcome: 'accepted',
      settledAt: 120,
      content: { name: 'Ada' },
    })
    expect(log.list('second')).toEqual([pending('two')])

    new McpExchangeLog(data).recover('second', new Set(), 200)
    expect(log.list('second')).toEqual([{ ...pending('two'), outcome: 'interrupted', settledAt: 200 }])
  })

  it('copies only earlier tool calls to a fork and deletes a removed conversation', () => {
    const data = mkdtempSync(join(tmpdir(), 'alpha-mcp-exchanges-'))
    const log = new McpExchangeLog(data)
    log.start('source', { ...pending('one', 'kept'), method: 'sampling/createMessage' })
    log.update('source', 'one', {
      submittedText: 'Edited prompt',
      model: { providerId: 'p', modelId: 'm' },
      usage: { input: 12, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 17, cost: 0 },
    })
    log.finish('source', 'one', 'declined', 150)
    log.start('source', pending('two', 'discarded'))
    log.finish('source', 'two', 'cancelled', 160)

    log.fork('source', 'branch', new Set(['kept']))
    expect(log.list('branch').map((record) => record.id)).toEqual(['one'])
    expect(log.list('branch')[0]).toMatchObject({
      method: 'sampling/createMessage',
      submittedText: 'Edited prompt',
      usage: { totalTokens: 17 },
    })
    log.forget('source')
    expect(log.list('source')).toEqual([])
    expect(log.list('branch')).toHaveLength(1)
  })

  it('persists actual sampling use even when its generated text is declined', () => {
    const data = mkdtempSync(join(tmpdir(), 'alpha-mcp-exchanges-'))
    const log = new McpExchangeLog(data)
    log.start('first', { ...pending('sample'), method: 'sampling/createMessage' })
    log.update('first', 'sample', {
      submittedText: 'Edited prompt',
      model: { providerId: 'p', modelId: 'm' },
      usage: { input: 12, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 17, cost: 0 },
    })
    log.finish('first', 'sample', 'declined', 200)
    expect(new McpExchangeLog(data).list('first')[0]).toMatchObject({
      outcome: 'declined',
      submittedText: 'Edited prompt',
      usage: { totalTokens: 17 },
    })
  })
})
