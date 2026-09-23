import { describe, expect, it } from 'vitest'
import { exportFileName, exportMarkdown } from './export.ts'
import type { ChatMessage, ConversationSummary } from './runtime-events.ts'

const conversation: ConversationSummary = {
  id: 'c1',
  workspacePath: '/dev/alpha',
  title: 'Rename the parser',
  createdAt: 1,
  updatedAt: 2,
  status: 'idle',
  permissionLevel: 'ask',
  model: { providerId: 'faux', modelId: 'scripted' },
  thinkingLevel: 'medium',
}

const user = (text: string): ChatMessage => ({
  id: 'u1',
  role: 'user',
  blocks: [{ kind: 'text', text }],
  createdAt: 10,
  status: 'complete',
})

const assistant = (blocks: ChatMessage['blocks']): ChatMessage => ({
  id: 'a1',
  role: 'assistant',
  blocks,
  createdAt: 20,
  status: 'complete',
})

describe('[domain] exportMarkdown', () => {
  it('names the conversation and the workspace it belongs to', () => {
    const markdown = exportMarkdown(conversation, [])
    expect(markdown).toContain('# Rename the parser')
    expect(markdown).toContain('/dev/alpha')
  })

  it('writes each message in order, with its role', () => {
    const markdown = exportMarkdown(conversation, [user('hello'), assistant([{ kind: 'text', text: 'hi there' }])])
    expect(markdown.indexOf('## You')).toBeLessThan(markdown.indexOf('## Alpha'))
    expect(markdown).toContain('hello')
    expect(markdown).toContain('hi there')
  })

  it('keeps thinking, marked as what it is', () => {
    const markdown = exportMarkdown(conversation, [
      assistant([
        { kind: 'thinking', text: 'weighing it up' },
        { kind: 'text', text: 'the answer' },
      ]),
    ])
    expect(markdown).toContain('### Thinking')
    expect(markdown).toContain('weighing it up')
  })

  it('includes a tool call with its arguments and its output', () => {
    const markdown = exportMarkdown(conversation, [
      assistant([
        {
          kind: 'tool',
          callId: 'call-1',
          name: 'bash',
          risk: 'execute',
          summary: 'pnpm test',
          raw: '{"command":"pnpm test"}',
          status: 'ok',
          output: '3 passed',
          startedAt: 30,
          endedAt: 900,
        },
      ]),
    ])
    expect(markdown).toContain('bash')
    expect(markdown).toContain('pnpm test')
    expect(markdown).toContain('"command":"pnpm test"')
    expect(markdown).toContain('3 passed')
  })

  it('says when a tool failed, and how', () => {
    const markdown = exportMarkdown(conversation, [
      assistant([
        {
          kind: 'tool',
          callId: 'call-1',
          name: 'bash',
          risk: 'execute',
          summary: 'cat missing.txt',
          raw: '{"command":"cat missing.txt"}',
          status: 'failed',
          output: 'No such file',
          details: { exitCode: 1 },
          startedAt: 30,
          endedAt: 40,
        },
      ]),
    ])
    expect(markdown).toContain('failed')
    expect(markdown).toContain('No such file')
    expect(markdown).toContain('exit 1')
  })

  it('marks an interrupted answer rather than passing it off as complete', () => {
    const markdown = exportMarkdown(conversation, [
      { ...assistant([{ kind: 'text', text: 'half an answer' }]), status: 'interrupted' },
    ])
    expect(markdown).toContain('half an answer')
    expect(markdown).toContain('interrupted')
  })

  it('shows where the history was compacted and what the summary said', () => {
    const markdown = exportMarkdown(conversation, [
      assistant([{ kind: 'compaction', summary: 'Earlier turns were about the parser.' }]),
      user('and now?'),
    ])
    expect(markdown).toContain('summarised')
    expect(markdown).toContain('Earlier turns were about the parser.')
    expect(markdown.indexOf('Earlier turns')).toBeLessThan(markdown.indexOf('and now?'))
  })

  it('ends with a newline, so appending to the file is not a fight', () => {
    expect(exportMarkdown(conversation, [user('hello')]).endsWith('\n')).toBe(true)
  })
})

describe('[domain] exportFileName', () => {
  it('makes a readable file name out of the title', () => {
    expect(exportFileName('Rename the parser')).toBe('rename-the-parser.md')
  })

  it('does not leave path separators or punctuation in it', () => {
    expect(exportFileName('fix src/parser.ts: the bug!')).toBe('fix-src-parser-ts-the-bug.md')
  })

  it('falls back to a name when the title has nothing usable in it', () => {
    expect(exportFileName('...')).toBe('conversation.md')
  })

  it('keeps the name short enough for every filesystem', () => {
    expect(exportFileName('a '.repeat(200)).length).toBeLessThanOrEqual(63)
  })
})
