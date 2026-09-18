import { describe, expect, it } from 'vitest'
import { exitCodeFromText, summarizeToolCall, toolDetails } from './tool-call.ts'

describe('summarizeToolCall', () => {
  it('names the file a read is about', () => {
    expect(summarizeToolCall('read', { path: 'src/index.ts' })).toBe('src/index.ts')
  })

  it('names the file an edit is about', () => {
    expect(summarizeToolCall('edit', { path: 'src/index.ts', edits: [] })).toBe('src/index.ts')
  })

  it('shows the command a bash call runs', () => {
    expect(summarizeToolCall('bash', { command: 'pnpm test' })).toBe('pnpm test')
  })

  it('keeps a long command on one line', () => {
    const summary = summarizeToolCall('bash', { command: `echo one\n${'x'.repeat(200)}` })
    expect(summary.startsWith('echo one')).toBe(true)
    expect(summary).not.toContain('\n')
    expect(summary.length).toBeLessThan(90)
  })

  it('counts the edits when there is more than one', () => {
    const edits = [
      { oldText: 'a', newText: 'b' },
      { oldText: 'c', newText: 'd' },
    ]
    expect(summarizeToolCall('edit', { path: 'src/index.ts', edits })).toBe('src/index.ts (2 edits)')
  })

  it('falls back to the arguments for a tool it does not know', () => {
    expect(summarizeToolCall('deploy', { target: 'prod' })).toBe('{"target":"prod"}')
  })

  it('survives arguments that are not an object', () => {
    expect(summarizeToolCall('read', 'nonsense')).toBe('nonsense')
  })
})

describe('exitCodeFromText', () => {
  it('finds the exit code the shell reported', () => {
    expect(exitCodeFromText('boom\n\nCommand exited with code 127')).toBe(127)
  })

  it('reports nothing when the text does not mention one', () => {
    expect(exitCodeFromText('all good')).toBeUndefined()
  })
})

describe('toolDetails', () => {
  it('carries the edit diff through untouched', () => {
    expect(toolDetails('edit', { diff: '@@ -1 +1 @@', patch: 'p' })).toEqual({ diff: '@@ -1 +1 @@' })
  })

  it('points at the full output when the shell truncated it', () => {
    const details = { truncation: { totalLines: 5000 }, fullOutputPath: '/tmp/full.log' }
    expect(toolDetails('bash', details)).toEqual({ truncated: true, fullOutputPath: '/tmp/full.log' })
  })

  it('says nothing when there is nothing to say', () => {
    expect(toolDetails('bash', undefined)).toBeUndefined()
  })

  it('reads the exit code out of the failure text', () => {
    expect(toolDetails('bash', undefined, 'nope\n\nCommand exited with code 1')).toEqual({ exitCode: 1 })
  })
})
