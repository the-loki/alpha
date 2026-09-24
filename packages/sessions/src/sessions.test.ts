import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  findSessionFile,
  parseSession,
  SessionStore,
  sessionDirectoryFor,
  sessionIdOf,
  tipPath,
  usageOf,
} from './sessions.ts'

const roots: string[] = []

function aRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'alpha-sessions-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const WORKSPACE = '/tmp/alpha-ws'

/** A pi-written session, the shapes 0.86 wrote, which existing conversations are on. */
const PI_SESSION = [
  JSON.stringify({ type: 'session', version: 3, id: 'pi-one', timestamp: '2026-09-21T10:00:00.000Z', cwd: WORKSPACE }),
  JSON.stringify({
    type: 'message',
    id: 'aaaa0001',
    parentId: null,
    timestamp: '2026-09-21T10:00:01.000Z',
    message: { role: 'user', content: [{ type: 'text', text: 'hello' }], timestamp: 1 },
  }),
  JSON.stringify({
    type: 'message',
    id: 'aaaa0002',
    parentId: 'aaaa0001',
    timestamp: '2026-09-21T10:00:02.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'hi' }],
      usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { total: 0.5 } },
      stopReason: 'stop',
      timestamp: 2,
    },
  }),
].join('\n')

describe('where a workspace keeps its sessions', () => {
  it('names the directory the way pi did, so existing ones are found', () => {
    expect(sessionDirectoryFor('/data/sessions', '/home/me/My Project')).toBe('/data/sessions/--home-me-My Project--')
  })
})

describe('reading a session file', () => {
  it('skips the header line, whichever agent wrote it', () => {
    const pi = parseSession(PI_SESSION)
    expect(pi.entries).toHaveLength(2)
    expect(pi.leafId).toBe('aaaa0002')

    const alpha = parseSession(
      [
        JSON.stringify({ type: 'alpha-session', version: 1, id: 'one', timestamp: 'x', cwd: WORKSPACE }),
        JSON.stringify({
          type: 'message',
          id: 'b1',
          parentId: null,
          timestamp: 1,
          message: { role: 'user', content: [] },
        }),
      ].join('\n'),
    )
    expect(alpha.entries).toHaveLength(1)
  })

  it('reads the path from the tip, not the whole log', () => {
    const { entries } = parseSession(PI_SESSION)
    const branched = `${PI_SESSION}\n${JSON.stringify({
      type: 'message',
      id: 'aaaa0003',
      parentId: 'aaaa0001',
      timestamp: 3,
      message: { role: 'assistant', content: [{ type: 'text', text: 'other branch' }], stopReason: 'stop' },
    })}`
    const offBranch = parseSession(branched)

    expect(tipPath(entries, 'aaaa0002').map((entry) => entry.id)).toEqual(['aaaa0001', 'aaaa0002'])
    expect(tipPath(offBranch.entries, 'aaaa0003').map((entry) => entry.id)).toEqual(['aaaa0001', 'aaaa0003'])
  })
})

describe('what a session has spent', () => {
  it('keeps delegated usage and cost on the active path, excluding a later abandoned branch', () => {
    const store = new SessionStore(aRoot())
    store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'subagent_usage', usage: { input: 2, output: 1, totalTokens: 3, cost: 0.03 } },
    })
    const later = store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'subagent_usage', usage: { input: 3, output: 2, totalTokens: 5, cost: 0.05 } },
    })

    expect(store.usage('one', WORKSPACE)).toMatchObject({ input: 5, output: 3, totalTokens: 8, cost: 0.08 })
    const forked = store.fork('one', WORKSPACE, later.id)
    if (forked === undefined) throw new Error('the session did not fork')
    expect(store.usage(forked, WORKSPACE)).toMatchObject({ input: 2, output: 1, totalTokens: 3, cost: 0.03 })
  })

  it('adds up the usage on the path, and nothing off it', () => {
    const { entries } = parseSession(PI_SESSION)
    expect(usageOf(tipPath(entries, 'aaaa0002'))).toMatchObject({ input: 10, output: 2, totalTokens: 12, cost: 0.5 })
    expect(usageOf([])).toMatchObject({ input: 0, totalTokens: 0, cost: 0 })
  })
})

describe('finding a session file', () => {
  it('finds the file the session id names', () => {
    const root = aRoot()
    const directory = sessionDirectoryFor(root, WORKSPACE)
    const store = new SessionStore(root)
    store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'user', content: [] } },
    })
    expect(findSessionFile(directory, 'one')).toBeDefined()
    expect(findSessionFile(directory, 'two')).toBeUndefined()
  })

  it('prefers the newest file when a legacy import left more than one', () => {
    const root = aRoot()
    const directory = sessionDirectoryFor(root, WORKSPACE)
    const store = new SessionStore(root)
    store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'user', content: [] } },
    })
    // A legacy import wrote an older copy under the same id, with an older name.
    writeFileSync(join(directory, '2026-01-01T00-00-00-000Z_one.jsonl'), `${PI_SESSION}\n`)
    const found = findSessionFile(directory, 'one')
    expect(found).toBeDefined()
    expect(basename(found ?? '')).not.toContain('2026-01-01')
  })
})

describe('the store writes what it is handed', () => {
  it('chains entries and writes the header once', () => {
    const root = aRoot()
    const store = new SessionStore(root)
    const first = store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'q' }] } },
    })
    const second = store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: {
        type: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'a' }], stopReason: 'stop' },
      },
    })

    expect(first.parentId).toBeNull()
    expect(second.parentId).toBe(first.id)
    const file = findSessionFile(sessionDirectoryFor(root, WORKSPACE), 'one')
    const lines = (
      readFileSync(file ?? '', 'utf-8')
        .trim()
        .split('\n') ?? []
    ).map((line) => JSON.parse(line))
    expect(lines[0]).toMatchObject({ type: 'alpha-session', version: 1, id: 'one', cwd: WORKSPACE })
    expect(lines).toHaveLength(3)
  })

  it('a compaction is an entry like any other', () => {
    const root = aRoot()
    const store = new SessionStore(root)
    const kept = store.compact({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      summary: 'the summary',
      firstKeptEntryId: undefined,
    })
    expect(kept.type).toBe('compaction')
    expect(kept.summary).toBe('the summary')
  })
})

describe('forking copies the path before an entry', () => {
  it('the copy carries the path, the original is untouched', () => {
    const root = aRoot()
    const store = new SessionStore(root)
    const first = store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'q' }] } },
    })
    store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'assistant', content: [], stopReason: 'stop' } },
    })

    const forked = store.fork('one', WORKSPACE, first.id)
    expect(forked).toBeDefined()
    expect(forked).not.toBe('one')

    const original = store.entries('one', WORKSPACE)
    expect(original.entries).toHaveLength(2)
    const copy = store.entries(forked ?? '', WORKSPACE)
    expect(copy.entries).toHaveLength(0)
    expect(copy.leafId).toBeNull()
  })

  it('forking at the last entry keeps everything before it', () => {
    const root = aRoot()
    const store = new SessionStore(root)
    const first = store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'q' }] } },
    })
    const second = store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'assistant', content: [], stopReason: 'stop' } },
    })

    const forked = store.fork('one', WORKSPACE, second.id)
    const copy = store.entries(forked ?? '', WORKSPACE)
    expect(copy.entries.map((entry) => entry.id)).toEqual([first.id])
  })

  it('an unknown entry forks nothing', () => {
    const root = aRoot()
    const store = new SessionStore(root)
    store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'user', content: [] } },
    })
    expect(store.fork('one', WORKSPACE, 'nope')).toBeUndefined()
  })
})

describe('taking a session off the disk', () => {
  it('delete means delete', () => {
    const root = aRoot()
    const store = new SessionStore(root)
    store.append({
      sessionId: 'one',
      workspacePath: WORKSPACE,
      entry: { type: 'message', message: { role: 'user', content: [] } },
    })
    store.remove('one', WORKSPACE)
    expect(readdirSync(sessionDirectoryFor(root, WORKSPACE))).toEqual([])
  })
})

describe('[sessions] sessionIdOf', () => {
  it('reads an absent session id as the conversation being its own session', () => {
    expect(sessionIdOf({ id: 'c1', sessionId: undefined })).toBe('c1')
  })

  it('reads the session the conversation was forked onto when there is one', () => {
    expect(sessionIdOf({ id: 'c1', sessionId: 'the-fork' })).toBe('the-fork')
  })
})
