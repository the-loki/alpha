import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'
import { createCodingToolsPlugin } from './coding-tools-plugin.ts'

/**
 * The coding tools plugin (ADR-0025): pi-agent-core's four coding tools over a real NodeExecutionEnv
 * rooted at the conversation's workspace — a relative path lands there, and a command runs there.
 */

const aWorkspace = (): string => mkdtempSync(join(tmpdir(), 'alpha-workspace-'))

const toolsOf = (workspace: string): AgentTool[] =>
  createCodingToolsPlugin({ workspacePath: workspace }).tools?.() ?? []

const toolOf = (tools: AgentTool[], name: string): AgentTool => {
  const tool = tools.find((candidate) => candidate.name === name)
  if (tool === undefined) throw new Error(`no ${name} tool`)
  return tool
}

describe('[runtime] the coding tools plugin', () => {
  it('offers the four coding tools in the order the old agent offered them', () => {
    const plugin = createCodingToolsPlugin({ workspacePath: aWorkspace() })

    expect(plugin.name).toBe('coding-tools')
    expect(plugin.tools?.().map((tool) => tool.name)).toEqual(['read', 'bash', 'edit', 'write'])
  })

  it('the read tool reads a file in the conversation workspace', async () => {
    const workspace = aWorkspace()
    writeFileSync(join(workspace, 'notes.txt'), 'the parser is named pi\n')
    const read = toolOf(toolsOf(workspace), 'read')

    const result = await read.execute('call-1', { path: 'notes.txt' })

    expect(JSON.stringify(result.content)).toContain('the parser is named pi')
  })

  it('the bash tool runs a command in the conversation workspace', async () => {
    const workspace = aWorkspace()
    const bash = toolOf(toolsOf(workspace), 'bash')

    const result = await bash.execute('call-1', { command: 'echo alpha-embedded' })

    expect(JSON.stringify(result.content)).toContain('alpha-embedded')
  })

  it('the write and edit tools change a file in the conversation workspace', async () => {
    const workspace = aWorkspace()
    writeFileSync(join(workspace, 'draft.txt'), 'one line\n')
    const tools = toolsOf(workspace)

    await toolOf(tools, 'write').execute('call-1', { path: 'draft.txt', content: 'replaced line\n' })
    await toolOf(tools, 'edit').execute('call-2', {
      path: 'draft.txt',
      edits: [{ oldText: 'replaced', newText: 'edited' }],
    })

    expect(readFileSync(join(workspace, 'draft.txt'), 'utf-8')).toBe('edited line\n')
  })
})
