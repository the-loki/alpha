import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importLegacySession, importLegacySessionIn, isLegacySession } from './legacy-sessions.ts'

/**
 * The old file is the person's, and it stays theirs: what is tested here is that a conversation
 * written by the previous Alpha can be read, that the copy is in the agent's own format, and that
 * the original is exactly where it was.
 */
const legacyFile = (id: string): string =>
  `${[
    JSON.stringify({ v: 4, kind: 'header', id, storageVersion: 1, createdAt: 1_700_000_000_000, cwd: '/dev/alpha' }),
    JSON.stringify({
      seq: 1,
      kind: 'entry',
      id: 'e1',
      parentId: null,
      timestamp: 1_700_000_000_001,
      type: 'message',
      message: { role: 'user', content: [{ type: 'text', text: 'fix the parser' }], timestamp: 1_700_000_000_001 },
    }),
    JSON.stringify([{ seq: 2, kind: 'value', op: 'set', namespace: 'state', value: { thinkingLevel: 'medium' } }]),
    JSON.stringify({
      seq: 3,
      kind: 'entry',
      id: 'e2',
      parentId: 'e1',
      timestamp: 1_700_000_000_002,
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        stopReason: 'stop',
        timestamp: 1_700_000_000_002,
      },
    }),
    JSON.stringify({
      seq: 4,
      kind: 'entry',
      id: 'e3',
      parentId: 'e2',
      timestamp: 1_700_000_000_003,
      type: 'compaction',
      summary: 'Earlier turns were about naming things.',
    }),
  ].join('\n')}\n`

describe('[runtime] a conversation the previous Alpha wrote', () => {
  it('is recognised by its header, and the agent’s own files are not', () => {
    expect(isLegacySession(legacyFile('c1'))).toBe(true)
    expect(isLegacySession(`${JSON.stringify({ type: 'session', version: 3, id: 'c1' })}\n`)).toBe(false)
    expect(isLegacySession('')).toBe(false)
  })

  it('comes across as entries the agent can open, in the same order and tree', () => {
    const imported = importLegacySession(legacyFile('c1'))
    expect(imported).toBeDefined()
    const lines = (imported ?? '')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    expect(lines[0]).toMatchObject({ type: 'session', version: 3, id: 'c1', cwd: '/dev/alpha' })
    // Messages, their tree, and a compaction: the transcript and the history behind it.
    expect(lines.slice(1)).toEqual([
      {
        type: 'message',
        id: 'e1',
        parentId: null,
        timestamp: new Date(1_700_000_000_001).toISOString(),
        message: { role: 'user', content: [{ type: 'text', text: 'fix the parser' }], timestamp: 1_700_000_000_001 },
      },
      {
        type: 'message',
        id: 'e2',
        parentId: 'e1',
        timestamp: new Date(1_700_000_000_002).toISOString(),
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done.' }],
          stopReason: 'stop',
          timestamp: 1_700_000_000_002,
        },
      },
      {
        type: 'compaction',
        id: 'e3',
        parentId: 'e2',
        timestamp: new Date(1_700_000_000_003).toISOString(),
        summary: 'Earlier turns were about naming things.',
      },
    ])
  })

  it('is copied under the conversation’s own id, and the old file is left alone', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alpha-legacy-'))
    const old = join(directory, '2026-01-01T00-00-00-000Z_c1.jsonl')
    writeFileSync(old, legacyFile('c1'), 'utf-8')

    importLegacySessionIn(directory, 'c1')

    const files = readdirSync(directory).sort()
    expect(files).toHaveLength(2)
    // The agent finds a session by name, so the copy carries the conversation's id.
    const copy = files.find((name) => name !== '2026-01-01T00-00-00-000Z_c1.jsonl')
    expect(copy).toContain('_c1.jsonl')
    const imported = readFileSync(join(directory, copy ?? ''), 'utf-8')
    expect(isLegacySession(imported)).toBe(false)
    expect(imported).toContain('fix the parser')
    // Nothing was migrated by rewriting: the person's file is byte for byte what it was.
    expect(readFileSync(old, 'utf-8')).toBe(legacyFile('c1'))
  })

  it('does not copy a conversation the agent already wrote', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alpha-legacy-'))
    writeFileSync(
      join(directory, '2026-02-02T00-00-00-000Z_c2.jsonl'),
      `${JSON.stringify({ type: 'session', version: 3, id: 'c2' })}\n`,
      'utf-8',
    )

    importLegacySessionIn(directory, 'c2')

    expect(readdirSync(directory)).toHaveLength(1)
  })

  it('has nothing to say about a conversation that was never written', () => {
    const directory = mkdtempSync(join(tmpdir(), 'alpha-legacy-'))
    importLegacySessionIn(directory, 'nobody')
    importLegacySessionIn(join(directory, 'nowhere'), 'nobody')
    expect(existsSync(directory)).toBe(true)
  })
})
