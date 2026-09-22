import { describe, expect, it } from 'vitest'
import { type ReadTextFile, systemPromptFor } from './system-prompt.ts'

/** A file system in a record: answers the file's text, or nothing for a file that is not there. */
const reading = (files: Record<string, string>): ReadTextFile => {
  return async (path) => {
    const found = files[path]
    return found === undefined ? undefined : found
  }
}

describe('the system prompt for a workspace', () => {
  it('tells the agent who it is and which workspace it works in', async () => {
    const prompt = await systemPromptFor('/home/loki/notes', reading({}))
    expect(prompt).toContain('coding agent')
    expect(prompt).toContain('workspace')
    expect(prompt).toContain('/home/loki/notes')
  })

  it('carries AGENTS.md when the workspace has one, and ignores CLAUDE.md beside it', async () => {
    const prompt = await systemPromptFor(
      '/ws',
      reading({ '/ws/AGENTS.md': 'the AGENTS way', '/ws/CLAUDE.md': 'the CLAUDE way' }),
    )
    expect(prompt).toContain('the AGENTS way')
    expect(prompt).not.toContain('the CLAUDE way')
  })

  it('falls back to CLAUDE.md when there is no AGENTS.md', async () => {
    const prompt = await systemPromptFor('/ws', reading({ '/ws/CLAUDE.md': 'the CLAUDE way' }))
    expect(prompt).toContain('the CLAUDE way')
  })

  it('prompts without a file section when the workspace carries neither file', async () => {
    const asked: string[] = []
    const reader: ReadTextFile = async (path) => {
      asked.push(path)
      return undefined
    }
    const prompt = await systemPromptFor('/ws', reader)
    expect(prompt).not.toContain('way')
    expect(asked.some((path) => path.endsWith('AGENTS.md'))).toBe(true)
  })
})
