import { describe, expect, it } from 'vitest'
import { FrameReader, frame } from './frames.ts'

const read = (...chunks: string[]): { records: unknown[]; rejected: number } => {
  const reader = new FrameReader()
  const records: unknown[] = []
  let rejected = 0
  for (const chunk of chunks) {
    const step = reader.push(chunk)
    records.push(...step.records)
    rejected += step.rejected
  }
  return { records, rejected }
}

describe("[agent] reading the agent's side of the pipe", () => {
  it('reads one JSON record per line', () => {
    const { records } = read('{"type":"response","id":"a","success":true}\n{"type":"agent_start"}\n')

    expect(records).toEqual([{ type: 'response', id: 'a', success: true }, { type: 'agent_start' }])
  })

  it('keeps a record together across chunks, wherever the split falls', () => {
    const one = '{"type":"message_update","text":"'
    const two = 'hel'
    const three = 'lo"}\n'

    expect(read(one, two, three).records).toEqual([{ type: 'message_update', text: 'hello' }])
  })

  it('does not split on the line separators that are legal inside JSON strings', () => {
    // readline would cut this in three: U+2028 and U+2029 are separators to it and characters here.
    const separator = '\u2028'
    const paragraph = '\u2029'
    const line = `${JSON.stringify({ type: 'message_update', text: `one${separator}two${paragraph}three` })}\n`

    expect(read(line).records).toEqual([{ type: 'message_update', text: `one${separator}two${paragraph}three` }])
  })

  it('accepts a carriage return before the newline, as some writers send', () => {
    expect(read('{"type":"agent_end"}\r\n').records).toEqual([{ type: 'agent_end' }])
  })

  it('skips a line that is blank, and counts one that is not JSON', () => {
    const { records, rejected } = read('\n{"type":"agent_start"}\nnot json at all\n')

    expect(records).toEqual([{ type: 'agent_start' }])
    expect(rejected).toBe(1)
  })

  it('holds an unterminated record until the rest of it arrives', () => {
    const { records } = read('{"type":"agent_end"')

    expect(records).toEqual([])
  })

  it('writes exactly one record and one newline, so a frame cannot arrive as two', () => {
    expect(frame({ type: 'prompt', message: 'two\nlines' })).toBe('{"type":"prompt","message":"two\\nlines"}\n')
  })
})
