import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Undef, WorkspaceChangeSet } from '@alpha/domain'
import { Type } from 'typebox'
import { Value } from 'typebox/value'
import { captureWorkspace, compareWorkspace, type WorkspaceSnapshot } from './workspace-snapshot.ts'

interface PendingCapture {
  id: string
  workspacePath: string
  startedAt: number
  snapshot: WorkspaceSnapshot
}

interface ChangeFile {
  version: 1
  reviews: WorkspaceChangeSet[]
  pending?: PendingCapture
}

const StampSchema = Type.Object({ digest: Type.String(), text: Type.Optional(Type.String()) })
const SnapshotSchema = Type.Object({
  files: Type.Record(Type.String(), StampSchema),
  incomplete: Type.Boolean(),
  unscanned: Type.Array(Type.String()),
})
const PendingSchema = Type.Object({
  id: Type.String(),
  workspacePath: Type.String(),
  startedAt: Type.Number(),
  snapshot: SnapshotSchema,
})
const ChangeSchema = Type.Object({
  path: Type.String(),
  kind: Type.Union([Type.Literal('added'), Type.Literal('modified'), Type.Literal('deleted')]),
  beforeText: Type.Optional(Type.String()),
  afterText: Type.Optional(Type.String()),
})
const ReviewSchema = Type.Object({
  id: Type.String(),
  startedAt: Type.Number(),
  endedAt: Type.Number(),
  recovered: Type.Boolean(),
  incomplete: Type.Boolean(),
  files: Type.Array(ChangeSchema),
})
const FileSchema = Type.Object({
  version: Type.Literal(1),
  reviews: Type.Array(ReviewSchema),
  pending: Type.Optional(PendingSchema),
})

const REVIEWS_KEPT = 20
const emptyFile = (): ChangeFile => ({ version: 1, reviews: [] })
const safeCapture = (path: string): WorkspaceSnapshot => {
  try {
    return captureWorkspace(path)
  } catch {
    return { files: {}, incomplete: true, unscanned: [''] }
  }
}

/** Captures and remembers the net file changes of each run, beside its conversation transcript. */
export class WorkspaceChangeLog {
  private readonly directory: string
  private readonly active = new Map<string, PendingCapture>()

  public constructor(dataDirectory: string) {
    this.directory = join(dataDirectory, 'workspace-changes')
  }

  /** The baseline is persisted before a model may act, so a process exit can still be reviewed. */
  public begin(conversationId: string, workspacePath: string, startedAt: number): void {
    if (!this.active.has(conversationId)) this.recover(conversationId, startedAt)
    const pending = { id: randomUUID(), workspacePath, startedAt, snapshot: safeCapture(workspacePath) }
    this.active.set(conversationId, pending)
    const file = this.read(conversationId)
    this.write(conversationId, { ...file, pending })
  }

  /** A run's final observation includes retries and partial work before failure or Stop. */
  public finish(conversationId: string, endedAt: number): Undef<WorkspaceChangeSet> {
    return this.settle(conversationId, endedAt, false)
  }

  /** A prior process left a baseline, so compare it with the workspace as it is when reopened. */
  public recover(conversationId: string, at: number): Undef<WorkspaceChangeSet> {
    if (this.active.has(conversationId)) return undefined
    return this.settle(conversationId, at, true)
  }

  public list(conversationId: string): WorkspaceChangeSet[] {
    return this.read(conversationId).reviews
  }

  public forget(conversationId: string): void {
    this.active.delete(conversationId)
    rmSync(this.path(conversationId), { force: true })
  }

  private settle(conversationId: string, at: number, recovered: boolean): Undef<WorkspaceChangeSet> {
    const file = this.read(conversationId)
    const pending = this.active.get(conversationId) ?? file.pending
    if (pending === undefined) return undefined
    const final = safeCapture(pending.workspacePath)
    const review: WorkspaceChangeSet = {
      id: pending.id,
      startedAt: pending.startedAt,
      endedAt: Math.max(at, pending.startedAt),
      recovered,
      incomplete: pending.snapshot.incomplete || final.incomplete,
      files: compareWorkspace(pending.snapshot, final),
    }
    this.active.delete(conversationId)
    this.write(conversationId, { version: 1, reviews: [review, ...file.reviews].slice(0, REVIEWS_KEPT) })
    return review
  }

  private path(conversationId: string): string {
    const name = /^[A-Za-z0-9-]+$/.test(conversationId) ? conversationId : 'unknown'
    return join(this.directory, `${name}.json`)
  }

  private read(conversationId: string): ChangeFile {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path(conversationId), 'utf-8'))
      return Value.Check(FileSchema, parsed) ? (parsed as ChangeFile) : emptyFile()
    } catch {
      return emptyFile()
    }
  }

  private write(conversationId: string, file: ChangeFile): void {
    const destination = this.path(conversationId)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try {
      mkdirSync(this.directory, { recursive: true })
      writeFileSync(temporary, JSON.stringify(file), 'utf-8')
      renameSync(temporary, destination)
    } catch {
      try {
        rmSync(temporary, { force: true })
      } catch {
        // Losing a workspace review must not stop the agent's turn.
      }
    }
  }
}
