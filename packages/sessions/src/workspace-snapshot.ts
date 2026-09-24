import { createHash } from 'node:crypto'
import { lstatSync, opendirSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Undef, WorkspaceChange } from '@alpha/domain'

export interface FileStamp {
  digest: string
  text?: string
}

export interface WorkspaceSnapshot {
  files: Record<string, FileStamp>
  incomplete: boolean
  unscanned: string[]
}

const MAX_ENTRIES = 10_000
const MAX_BYTES = 64 * 1024 * 1024
const PREVIEW_BYTES = 64 * 1024
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules'])
const utf8 = new TextDecoder('utf-8', { fatal: true })

const digestOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

function textOf(bytes: Buffer): Undef<string> {
  if (bytes.includes(0)) return undefined
  try {
    return utf8.decode(bytes)
  } catch {
    return undefined
  }
}

interface ScanState extends WorkspaceSnapshot {
  bytesRead: number
  previewBytes: number
}

function markUnscanned(state: ScanState, path: string): void {
  state.incomplete = true
  state.unscanned.push(path)
}

function readRegular(path: string, relative: string, state: ScanState): void {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.size > MAX_BYTES - state.bytesRead) {
    markUnscanned(state, relative)
    return
  }
  const contents = readFileSync(path)
  state.bytesRead += contents.length
  if (state.bytesRead > MAX_BYTES || contents.length !== stat.size) {
    markUnscanned(state, relative)
    return
  }
  const stamp: FileStamp = { digest: digestOf(contents) }
  if (contents.length <= PREVIEW_BYTES && state.previewBytes + contents.length <= MAX_PREVIEW_BYTES) {
    const text = textOf(contents)
    if (text !== undefined) {
      stamp.text = text
      state.previewBytes += contents.length
    }
  }
  state.files[relative] = stamp
}

/** A bounded snapshot of actual files. Skipped and unreadable paths make coverage incomplete. */
export function captureWorkspace(root: string): WorkspaceSnapshot {
  const state: ScanState = {
    files: Object.create(null) as Record<string, FileStamp>,
    incomplete: false,
    unscanned: [],
    bytesRead: 0,
    previewBytes: 0,
  }
  const directories = [{ path: root, parts: [] as string[] }]
  let seen = 0
  while (directories.length > 0 && seen < MAX_ENTRIES) {
    const current = directories.pop()
    if (current === undefined) break
    try {
      const directory = opendirSync(current.path)
      try {
        let entry = directory.readSync()
        while (entry && seen < MAX_ENTRIES) {
          seen += 1
          const path = join(current.path, entry.name)
          const parts = [...current.parts, entry.name]
          const relative = parts.join('/')
          if (entry.isDirectory()) {
            if (SKIPPED_DIRECTORIES.has(entry.name)) markUnscanned(state, relative)
            else directories.push({ path, parts })
          } else {
            try {
              if (entry.isSymbolicLink()) {
                state.files[relative] = { digest: digestOf(Buffer.from(readlinkSync(path), 'utf-8')) }
              } else if (entry.isFile()) readRegular(path, relative, state)
              else markUnscanned(state, relative)
            } catch {
              markUnscanned(state, relative)
            }
          }
          entry = directory.readSync()
        }
        if (entry) markUnscanned(state, '')
      } finally {
        directory.closeSync()
      }
    } catch {
      markUnscanned(state, current.parts.join('/'))
    }
  }
  if (directories.length > 0) markUnscanned(state, '')
  return { files: state.files, incomplete: state.incomplete, unscanned: state.unscanned }
}

function trustsAbsence(snapshot: WorkspaceSnapshot, path: string): boolean {
  return !snapshot.unscanned.some((prefix) => prefix === '' || path === prefix || path.startsWith(`${prefix}/`))
}

/** Compare observations conservatively where a path was skipped or unreadable. */
export function compareWorkspace(before: WorkspaceSnapshot, after: WorkspaceSnapshot): WorkspaceChange[] {
  const paths = new Set([...Object.keys(before.files), ...Object.keys(after.files)])
  const changes: WorkspaceChange[] = []
  for (const path of [...paths].sort()) {
    const old = before.files[path]
    const current = after.files[path]
    if (old === undefined && current !== undefined && trustsAbsence(before, path)) {
      changes.push({ path, kind: 'added', ...(current.text === undefined ? {} : { afterText: current.text }) })
    } else if (current === undefined && old !== undefined && trustsAbsence(after, path)) {
      changes.push({ path, kind: 'deleted', ...(old.text === undefined ? {} : { beforeText: old.text }) })
    } else if (old !== undefined && current !== undefined && old.digest !== current.digest) {
      changes.push({
        path,
        kind: 'modified',
        ...(old.text === undefined ? {} : { beforeText: old.text }),
        ...(current.text === undefined ? {} : { afterText: current.text }),
      })
    }
  }
  return changes
}
