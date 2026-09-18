/**
 * Why each tool call was allowed, kept beside the session. pi's session records what ran; it has
 * no idea the call went past a permission gate, so the note that says how is Alpha's own and
 * lives in its own file — one per conversation, written as the decisions are made, deleted with
 * the conversation.
 *
 * A file that does not match is treated as absent, for the same reason the workbench state is:
 * losing a note is a smaller harm than a transcript that refuses to open.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ApprovalRecord, isPermissionLevel } from '@alpha/core'
import { Type } from 'typebox'
import { Value } from 'typebox/value'
import type { DecisionLookup } from './transcript-entries.ts'

const KIND = ['auto', 'rule', 'once', 'always', 'denied', 'blocked'] as const

const DecisionSchema = Type.Object({
  kind: Type.Union(KIND.map((kind) => Type.Literal(kind))),
  level: Type.String(),
  reason: Type.Optional(Type.String()),
  ruleId: Type.Optional(Type.String()),
})

const FileSchema = Type.Object({ decisions: Type.Record(Type.String(), Type.Unknown()) })

export class DecisionLog {
  readonly #directory: string

  constructor(dataDirectory: string) {
    this.#directory = join(dataDirectory, 'decisions')
  }

  read(conversationId: string): DecisionLookup {
    const decisions: DecisionLookup = new Map()
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.#path(conversationId), 'utf-8'))
    } catch {
      return decisions
    }
    if (!Value.Check(FileSchema, parsed)) return decisions
    for (const [callId, candidate] of Object.entries(parsed.decisions)) {
      const record = readRecord(candidate)
      if (record !== undefined) decisions.set(callId, record)
    }
    return decisions
  }

  /**
   * A write that fails is not worth failing a turn over — the gate calls this while a tool call is
   * waiting on it, and the note is the least important thing in the room. The next decision tries
   * again; a note that stays unwritten costs a line in the ledger, not a conversation.
   */
  write(conversationId: string, decisions: DecisionLookup): void {
    try {
      mkdirSync(this.#directory, { recursive: true })
      writeFileSync(this.#path(conversationId), JSON.stringify({ decisions: Object.fromEntries(decisions) }, null, 2))
    } catch {
      // Nothing to do and nowhere to say it: the gate is mid-call.
    }
  }

  forget(conversationId: string): void {
    rmSync(this.#path(conversationId), { force: true })
  }

  #path(conversationId: string): string {
    // The id is a uuid we generated, and it is still the one thing standing between a bug and a
    // path outside this directory, so it is checked rather than trusted.
    const safe = /^[A-Za-z0-9-]+$/.test(conversationId) ? conversationId : 'unknown'
    return join(this.#directory, `${safe}.json`)
  }
}

function readRecord(candidate: unknown): ApprovalRecord | undefined {
  if (!Value.Check(DecisionSchema, candidate)) return undefined
  const record = Value.Decode(DecisionSchema, candidate)
  if (!isPermissionLevel(record.level)) return undefined
  return {
    kind: record.kind,
    level: record.level,
    reason: record.reason,
    ruleId: record.ruleId,
  }
}
