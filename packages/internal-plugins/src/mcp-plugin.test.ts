/**
 * The MCP face on the base, without an agent and without a server: what the tools look like to the
 * model, what a call carries to the hub, and what a failure the server reported becomes. The
 * transport under it is `@alpha/mcp`'s, tested there against a real server; what is asked here is
 * only whether the shape handed to the agent is the shape the protocol promised.
 */

import { assembleAgent } from '@alpha/agent'
import { aModel, scriptedModels, toolNamed } from '@alpha/agent/testing'
import { toolRiskOf, type Undef } from '@alpha/domain'
import type { McpCallResult, McpServers, McpTool } from '@alpha/mcp'
import type { Agent } from '@earendil-works/pi-agent-core'
import { describe, expect, it } from 'vitest'
import { createMcpPlugin, mcpToolName } from './mcp-plugin.ts'

const TOOL: McpTool = {
  server: 'files',
  name: 'read_file',
  description: 'Reads a file.',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
}

/** A hub of one server, answering what the test tells it to and remembering what it was asked. */
function hubOf(answer: (tool: string, args: Record<string, unknown>) => Promise<McpCallResult>) {
  const asked: Array<{ server: string; tool: string; args: Record<string, unknown>; signal?: AbortSignal }> = []
  const servers: McpServers = {
    tools: () => [TOOL],
    call: (server, tool, args, signal) => {
      asked.push({ server, tool, args, signal })
      return answer(tool, args)
    },
    onToolsChanged: () => {},
    close: async () => {},
  }
  return { servers, asked }
}

const answered = (text: string): Promise<McpCallResult> =>
  Promise.resolve({ content: [{ type: 'text', text }], isError: false })

describe('[mcp] the plugin face', () => {
  it('offers the server’s tools under a name that says which server they came from', () => {
    const { servers } = hubOf(() => answered('read'))
    const [tool] = createMcpPlugin({ servers }).tools()

    expect(tool?.name).toBe('mcp__files__read_file')
    expect(tool?.label).toBe('read_file')
    expect(tool?.description).toBe('Reads a file.')
    expect(tool?.parameters).toEqual(TOOL.inputSchema)
    expect(tool?.executionMode).toBe('sequential')
  })

  it('carries the call to the server that owns the tool, arguments and all', async () => {
    const { servers, asked } = hubOf(() => answered('the file'))
    const [tool] = createMcpPlugin({ servers }).tools()

    const result = await tool?.execute('call-1', { path: 'notes.txt' })
    expect(asked).toEqual([{ server: 'files', tool: 'read_file', args: { path: 'notes.txt' }, signal: undefined }])
    expect(result?.content).toEqual([{ type: 'text', text: 'the file' }])
  })

  it('passes on the stop, so a run that is over stops the call too', async () => {
    const { servers, asked } = hubOf(() => answered('the file'))
    const [tool] = createMcpPlugin({ servers }).tools()
    const stop = new AbortController()

    await tool?.execute('call-2', { path: 'notes.txt' }, stop.signal)
    expect(asked[0]?.signal).toBe(stop.signal)
  })

  it('a failure the server reported is the tool failing, in the server’s own words', async () => {
    const { servers } = hubOf(() =>
      Promise.resolve({ content: [{ type: 'text', text: 'no such file' }], isError: true }),
    )
    const [tool] = createMcpPlugin({ servers }).tools()

    await expect(tool?.execute('call-3', { path: 'gone.txt' })).rejects.toThrow('no such file')
  })

  it('hands a server’s new tools to the conversation that is already open', () => {
    const listeners: Array<() => void> = []
    let offered: McpTool[] = [TOOL]
    const servers: McpServers = {
      tools: () => offered,
      call: () => Promise.resolve({ content: [], isError: false }),
      onToolsChanged: (listener) => listeners.push(listener),
      close: async () => {},
    }
    let agent: Undef<Agent>
    const plugin = createMcpPlugin({ servers, agent: () => agent })
    agent = assembleAgent({
      models: scriptedModels([]),
      model: aModel(),
      plugins: [plugin, { name: 'tools', tools: () => [toolNamed('read')] }],
      systemPrompt: 's',
    })
    expect(agent.state.tools.map((tool) => tool.name)).toEqual(['mcp__files__read_file', 'read'])

    offered = [...offered, { server: 'files', name: 'stat_file', description: 'Sizes a file.', inputSchema: {} }]
    for (const listener of listeners) listener()

    // The server's half is replaced, and Alpha's own tools are left exactly as they were.
    expect(agent.state.tools.map((tool) => tool.name)).toEqual([
      'read',
      'mcp__files__read_file',
      'mcp__files__stat_file',
    ])
  })

  it('a name no rule knows is the strictest class, which is how it reaches the gate', () => {
    expect(toolRiskOf(mcpToolName('files', 'read_file'))).toBe('execute')
  })
})
