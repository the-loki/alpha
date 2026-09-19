/**
 * Why each tool call was allowed, kept beside the session. pi's session records what ran; it has
 * no idea the call went past a permission gate, so the note that says how is Alpha's own and
 * lives in its own file — one per conversation, written as the decisions are made, deleted with
 * the conversation.
 *
 * The log hands out a ledger rather than a map, and the ledger knows which conversation it is:
 * the gate notes a decision and the ledger writes it, so the file a note lands in is decided once,
 * when the ledger is opened, instead of at every call site that might write one.
 *
 * A file that does not match is treated as absent, for the same reason the workbench state is:
 * losing a note is a smaller harm than a transcript that refuses to open.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ApprovalRecord, isPermissionLevel, type Undef } from '@alpha/core'
import { Type } from 'typebox'
import { Value } from 'typebox/value'

const KIND = ['auto', 'rule', 'once', 'always', 'denied', 'blocked'] as const

const DecisionSchema = Type.Object({
  kind: Type.Union(KIND.map((kind) => Type.Literal(kind))),
  level: Type.String(),
  reason: Type.Optional(Type.String()),
  ruleId: Type.Optional(Type.String()),
})

const FileSchema = Type.Object({ decisions: Type.Record(Type.String(), Type.Unknown()) })

/** How each call got past the gate, by call id: the part of pi's session the log does not hold. */
export interface DecisionLookup {
  get(callId: string): Undef<ApprovalRecord>
}

export class DecisionLog {
  readonly #directory: string

  constructor(dataDirectory: string) {
    this.#directory = join(dataDirectory, 'decisions')
  }

  /**
   * The ledger for one conversation: what was decided before, and where the next decision goes.
   * The id is bound here, once, so no caller ever names the file.
   */
  opened(conversationId: string): DecisionLedger {
    const location = { directory: this.#directory, name: this.#name(conversationId) }
    return new DecisionLedger({
      records: readRecords(location),
      persist: (records) => writeRecords(location, records),
    })
  }

  forget(conversationId: string): void {
    rmSync(join(this.#directory, this.#name(conversationId)), { force: true })
  }

  #name(conversationId: string): string {
    // The id is a uuid we generated, and it is still the one thing standing between a bug and a
    // path outside this directory, so it is checked rather than trusted.
    const safe = /^[A-Za-z0-9-]+$/.test(conversationId) ? conversationId : 'unknown'
    return `${safe}.json`
  }
}

/** Where one conversation's ledger lives: the directory it shares with the others, and its name. */
interface LedgerLocation {
  directory: string
  name: string
}

/**
 * One conversation's decisions, and the file they are written to. Holding the two together is
 * what makes them the same: the gate's note is the one way in, and a ledger opened by a log
 * writes the whole file on every note, so what is on screen is what a relaunch will read.
 *
 * A ledger with no file behind it is what a test gets, and it is not a stub: the gate records
 * what it decided, the rows carry that provenance, and only the writing is absent.
 */
export class DecisionLedger implements DecisionLookup {
  readonly #records: Map<string, ApprovalRecord>
  readonly #persist: Undef<(records: Map<string, ApprovalRecord>) => void>

  constructor(
    options: { records?: Map<string, ApprovalRecord>; persist?: (records: Map<string, ApprovalRecord>) => void } = {},
  ) {
    this.#records = options.records ?? new Map()
    this.#persist = options.persist
  }

  get(callId: string): Undef<ApprovalRecord> {
    return this.#records.get(callId)
  }

  /** The gate's note: remembered for the rows still to come, and written for the next launch. */
  note(callId: string, record: ApprovalRecord): void {
    this.#records.set(callId, record)
    this.#persist?.(this.#records)
  }
}

/**
 * A write that fails is not worth failing a turn over — the gate calls this while a tool call is
 * waiting on it, and the note is the least important thing in the room. The next decision tries
 * again; a note that stays unwritten costs a line in the ledger, not a conversation.
 */
function writeRecords(location: LedgerLocation, records: Map<string, ApprovalRecord>): void {
  try {
    mkdirSync(location.directory, { recursive: true })
    const document = { decisions: Object.fromEntries(records) }
    writeFileSync(join(location.directory, location.name), JSON.stringify(document, null, 2))
  } catch {
    // Nothing to do and nowhere to say it: the gate is mid-call.
  }
}

function readRecords(location: LedgerLocation): Map<string, ApprovalRecord> {
  const records = new Map<string, ApprovalRecord>()
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(location.directory, location.name), 'utf-8'))
  } catch {
    return records
  }
  if (!Value.Check(FileSchema, parsed)) return records
  for (const [callId, candidate] of Object.entries(parsed.decisions)) {
    const record = readRecord(candidate)
    if (record !== undefined) records.set(callId, record)
  }
  return records
}

function readRecord(candidate: unknown): Undef<ApprovalRecord> {
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
