import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpElicitationContent, McpExchange, McpExchangeOutcome, Undef } from '@alpha/domain'
import { Type } from 'typebox'
import { Value } from 'typebox/value'

const OutcomeSchema = Type.Union(
  ['pending', 'accepted', 'declined', 'cancelled', 'refused', 'interrupted'].map((value) => Type.Literal(value)),
)
const ExchangeSchema = Type.Object({
  id: Type.String(),
  server: Type.String(),
  method: Type.Union([Type.Literal('sampling/createMessage'), Type.Literal('elicitation/create')]),
  toolCallId: Type.String(),
  toolName: Type.String(),
  requestText: Type.String(),
  requestedAt: Type.Number(),
  outcome: OutcomeSchema,
  settledAt: Type.Optional(Type.Number()),
  content: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean()]))),
})
const FileSchema = Type.Object({ version: Type.Literal(1), records: Type.Array(ExchangeSchema) })
const KEEP = 200

/** Durable, bounded audit of the server requests that belonged to each conversation. */
export class McpExchangeLog {
  private readonly directory: string

  public constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, 'mcp-exchanges')
  }

  public start(conversationId: string, record: McpExchange): void {
    this.write(conversationId, [record, ...this.list(conversationId)].slice(0, KEEP))
  }

  public finish(
    conversationId: string,
    id: string,
    outcome: McpExchangeOutcome,
    at: number,
    content?: McpElicitationContent,
  ): Undef<McpExchange> {
    let finished: Undef<McpExchange>
    const records = this.list(conversationId).map((record) => {
      if (record.id !== id || record.outcome !== 'pending') return record
      finished = { ...record, outcome, settledAt: at, ...(content === undefined ? {} : { content }) }
      return finished
    })
    if (finished !== undefined) this.write(conversationId, records)
    return finished
  }

  public list(conversationId: string): McpExchange[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path(conversationId), 'utf-8'))
      return Value.Check(FileSchema, parsed) ? (parsed as { records: McpExchange[] }).records : []
    } catch {
      return []
    }
  }

  /** A former process can leave a pending record, but there is no server request left to answer. */
  public recover(conversationId: string, activeIds: Set<string>, at: number): void {
    let changed = false
    const records = this.list(conversationId).map((record) => {
      if (record.outcome !== 'pending' || activeIds.has(record.id)) return record
      changed = true
      return { ...record, outcome: 'interrupted' as const, settledAt: at }
    })
    if (changed) this.write(conversationId, records)
  }

  public fork(source: string, target: string, toolCallIds: Set<string>): void {
    const records = this.list(source).filter(
      (record) => record.outcome !== 'pending' && toolCallIds.has(record.toolCallId),
    )
    if (records.length > 0) this.write(target, records)
  }

  public forget(conversationId: string): void {
    rmSync(this.path(conversationId), { force: true })
  }

  private path(conversationId: string): string {
    const safe = /^[A-Za-z0-9-]+$/.test(conversationId) ? conversationId : 'unknown'
    return join(this.directory, `${safe}.json`)
  }

  private write(conversationId: string, records: McpExchange[]): void {
    const destination = this.path(conversationId)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      mkdirSync(this.directory, { recursive: true })
      writeFileSync(temporary, JSON.stringify({ version: 1, records }), 'utf-8')
      renameSync(temporary, destination)
    } catch {
      try {
        rmSync(temporary, { force: true })
      } catch {
        // A request can still be answered when its audit file cannot be written.
      }
    }
  }
}
