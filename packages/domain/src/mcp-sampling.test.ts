import { describe, expect, it } from 'vitest'
import { readMcpSampling, validMcpSamplingEdits } from './mcp-sampling.ts'

const request = {
  messages: [
    { role: 'user', content: { type: 'text', text: 'Summarize this file.' } },
    { role: 'assistant', content: { type: 'text', text: 'Which file?' } },
  ],
  systemPrompt: 'Answer briefly.',
  maxTokens: 256,
  includeContext: 'allServers',
  modelPreferences: { hints: [{ name: 'fast' }] },
}

describe('[domain] MCP sampling', () => {
  it('reads only explicit text and keeps context requests advisory', () => {
    expect(readMcpSampling(request)).toEqual({
      messages: [
        { role: 'user', text: 'Summarize this file.' },
        { role: 'assistant', text: 'Which file?' },
      ],
      systemPrompt: 'Answer briefly.',
      maxTokens: 256,
      requestedContext: true,
      hints: ['fast'],
    })
  })

  it('refuses unsupported content and unbounded requests', () => {
    expect(readMcpSampling({ ...request, messages: [] })).toBeUndefined()
    expect(readMcpSampling({ ...request, maxTokens: 0 })).toBeUndefined()
    expect(readMcpSampling({ ...request, maxTokens: 50_000 })).toBeUndefined()
    expect(
      readMcpSampling({ ...request, messages: [{ role: 'user', content: { type: 'audio', data: 'AA' } }] }),
    ).toBeUndefined()
    expect(
      readMcpSampling({ ...request, messages: [{ role: 'user', content: { type: 'image', data: 'AA' } }] }),
    ).toBeUndefined()
    expect(
      readMcpSampling({ ...request, messages: [{ role: 'system', content: { type: 'text', text: 'x' } }] }),
    ).toBeUndefined()
    expect(readMcpSampling({ ...request, systemPrompt: 'x'.repeat(4_001) })).toBeUndefined()
    expect(
      readMcpSampling({
        ...request,
        messages: [{ role: 'user', content: { type: 'text', text: 'x'.repeat(10_001) } }],
      }),
    ).toBeUndefined()
  })

  it('accepts edited text only for the original message sequence', () => {
    const prompt = readMcpSampling(request)
    if (prompt === undefined) throw new Error('test request was not read')
    expect(validMcpSamplingEdits(prompt, ['Use the README.', 'I will.'], 'New instructions.')).toBe(true)
    expect(validMcpSamplingEdits(prompt, ['one'], 'New instructions.')).toBe(false)
    expect(validMcpSamplingEdits(prompt, ['', 'I will.'], 'New instructions.')).toBe(false)
    expect(validMcpSamplingEdits(prompt, ['x'.repeat(10_001), 'I will.'], 'New instructions.')).toBe(false)
    expect(validMcpSamplingEdits(prompt, ['Use the README.', 'I will.'], 'x'.repeat(4_001))).toBe(false)
  })
})
