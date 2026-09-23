import { describe, expect, it } from 'vitest'
import type { ChatBlockTool } from './runtime-events.ts'
import {
  emptyAnswerIsEvidence,
  exitCodeFromText,
  outputTextOf,
  patchToolRow,
  summarizeToolCall,
  toolDetails,
  toolOutcomeOf,
  toolRowOf,
} from './tool-row.ts'

describe('[domain] patchToolRow', () => {
  const row = (callId: string): ChatBlockTool => toolRowOf({ callId, name: 'bash', args: {} }, 1)
  const text = { kind: 'text' as const, text: 'hi' }

  it('answers with new blocks where the row the call created stands', () => {
    const blocks = patchToolRow([text, row('a')], 'a', (block) => ({ ...block, output: 'out', status: 'ok' as const }))
    expect(blocks?.[1]).toMatchObject({ callId: 'a', output: 'out', status: 'ok' })
    expect(blocks?.[0]).toEqual(text)
  })

  it('answers with nothing when no row carries the call', () => {
    expect(patchToolRow([text], 'missing', (block) => block)).toBeUndefined()
  })
})

describe('[domain] emptyAnswerIsEvidence', () => {
  it('keeps an empty answer only when it failed or was stopped', () => {
    expect(emptyAnswerIsEvidence(false, false)).toBe(false)
    expect(emptyAnswerIsEvidence(true, false)).toBe(true)
    expect(emptyAnswerIsEvidence(false, true)).toBe(true)
  })
})

describe('[domain] summarizeToolCall', () => {
  it('names the file for the tools that work on one', () => {
    expect(summarizeToolCall('read', { path: 'src/index.ts' })).toBe('src/index.ts')

    expect(summarizeToolCall('edit', { path: 'src/index.ts', edits: [] })).toBe('src/index.ts')
  })

  it('shows the command for a shell call', () => {
    expect(summarizeToolCall('bash', { command: 'pnpm test' })).toBe('pnpm test')
  })

  it('collapses a multi-line command to one line', () => {
    const summary = summarizeToolCall('bash', { command: `echo one\n${'x'.repeat(200)}` })

    expect(summary).not.toContain('\n')
    expect(summary.length).toBeLessThanOrEqual(80)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('says how many edits an edit carries', () => {
    const edits = [
      { oldText: 'a', newText: 'b' },
      { oldText: 'c', newText: 'd' },
    ]
    expect(summarizeToolCall('edit', { path: 'src/index.ts', edits })).toBe('src/index.ts (2 edits)')
  })

  it('falls back to the arguments for a tool it does not know', () => {
    expect(summarizeToolCall('deploy', { target: 'prod' })).toBe('{"target":"prod"}')
  })

  it('does not fall over on arguments that are not an object', () => {
    expect(summarizeToolCall('read', 'nonsense')).toBe('nonsense')
  })
})

describe('[domain] exitCodeFromText', () => {
  it('reads the exit code the shell reported', () => {
    expect(exitCodeFromText('boom\n\nCommand exited with code 127')).toBe(127)
  })

  it('has nothing to report when the text does not say', () => {
    expect(exitCodeFromText('all good')).toBeUndefined()
  })
})

describe('[domain] toolDetails', () => {
  it('keeps the diff of an edit and drops what the row does not render', () => {
    expect(toolDetails('edit', { diff: '@@ -1 +1 @@', patch: 'p' })).toEqual({ diff: '@@ -1 +1 @@' })
  })

  it('keeps the truncation of a long output', () => {
    const details = { truncation: { omitted: 10 }, fullOutputPath: '/tmp/full.log' }
    expect(toolDetails('bash', details)).toEqual({ truncated: true, fullOutputPath: '/tmp/full.log' })
  })

  it('is undefined when there is nothing worth keeping', () => {
    expect(toolDetails('bash', undefined)).toBeUndefined()
  })

  it('takes the exit code from the output a command printed', () => {
    expect(toolDetails('bash', undefined, 'nope\n\nCommand exited with code 1')).toEqual({ exitCode: 1 })
  })
})

describe('[domain] outputTextOf', () => {
  it('joins the text parts of a result and ignores the rest', () => {
    const result = {
      content: [
        { type: 'text', text: 'first line' },
        { type: 'image', data: 'x' },
        { type: 'text', text: 'second line' },
      ],
    }
    expect(outputTextOf(result)).toBe('first line\nsecond line')
  })

  it('is empty when there is no content at all', () => {
    expect(outputTextOf(undefined)).toBe('')
  })
})

describe('[domain] toolRowOf', () => {
  it('builds the row a call starts as, from the facts alone', () => {
    const row = toolRowOf({ callId: 'call-1', name: 'edit', args: { path: 'a.ts', edits: [] } }, 1000)

    expect(row).toEqual({
      kind: 'tool',
      callId: 'call-1',
      name: 'edit',
      risk: 'write',
      summary: 'a.ts',
      raw: '{"path":"a.ts","edits":[]}',
      status: 'running',
      output: '',
      approval: undefined,
      startedAt: 1000,
    })
  })

  it('carries the decision it was given, so a restored row still says why it ran', () => {
    const approval = { kind: 'once', level: 'ask' } as const
    const row = toolRowOf({ callId: 'call-1', name: 'read', args: { path: 'a.ts' }, approval }, 5)

    expect(row.approval).toEqual(approval)
  })

  it('calls a tool it does not know the most dangerous class', () => {
    expect(toolRowOf({ callId: 'call-2', name: 'deploy', args: {} }, 1).risk).toBe('execute')
  })
})

describe('[domain] toolOutcomeOf', () => {
  it('reads a call that worked: the text it printed, and its details', () => {
    const result = { content: [{ type: 'text', text: 'hello' }], details: { fullOutputPath: '/tmp/full.log' } }

    expect(toolOutcomeOf('read', result)).toEqual({
      status: 'ok',
      output: 'hello',
      details: { fullOutputPath: '/tmp/full.log' },
    })
  })

  it('reads a call that failed, exit code and all', () => {
    const result = { content: [{ type: 'text', text: 'boom\n\nCommand exited with code 3' }], isError: true }

    expect(toolOutcomeOf('bash', result)).toEqual({
      status: 'failed',
      output: 'boom\n\nCommand exited with code 3',
      details: { exitCode: 3 },
    })
  })

  it('has nothing to say about a call whose result never arrived', () => {
    expect(toolOutcomeOf('bash')).toEqual({ status: 'ok', output: '', details: undefined })
  })
})
