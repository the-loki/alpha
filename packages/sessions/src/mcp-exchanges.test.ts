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
    log.start('source', pending('one', 'kept'))
    log.finish('source', 'one', 'declined', 150)
    log.start('source', pending('two', 'discarded'))
    log.finish('source', 'two', 'cancelled', 160)

    log.fork('source', 'branch', new Set(['kept']))
    expect(log.list('branch').map((record) => record.id)).toEqual(['one'])
    log.forget('source')
    expect(log.list('source')).toEqual([])
    expect(log.list('branch')).toHaveLength(1)
  })
})
