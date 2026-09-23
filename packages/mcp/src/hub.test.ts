/**
 * Two servers at once: the hub hands back one flat list of tools that says which server each came
 * from, routes a call to the server that owns it, and refuses a server it does not hold. The two
 * children say their own name back, so a call landing on the wrong one would be visible.
 */

import { describe, expect, it } from 'vitest'
import type { McpServerDefinition } from './client.ts'
import { connectMcpServers } from './servers.ts'

const SERVER = new URL('./scripted-server.ts', import.meta.url).pathname

function scripted(name: string): McpServerDefinition {
  return {
    name,
    command: process.execPath,
    args: ['--experimental-strip-types', SERVER],
    env: { SCRIPTED_MCP_NAME: `${name}-` },
  }
}

describe('the servers one workbench holds', () => {
  it('says which server each tool came from, and calls the one that owns it', async () => {
    const servers = await connectMcpServers([scripted('one'), scripted('two')])
    const echo = servers.tools().filter((tool) => tool.name === 'echo')
    expect(echo.map((tool) => tool.server)).toEqual(['one', 'two'])

    const first = await servers.call('one', 'echo', { text: 'hello' })
    const second = await servers.call('two', 'echo', { text: 'hello' })
    expect(first.content).toEqual([{ type: 'text', text: 'echo: one-hello' }])
    expect(second.content).toEqual([{ type: 'text', text: 'echo: two-hello' }])

    await expect(servers.call('three', 'echo', { text: 'hello' })).rejects.toThrow('no MCP server three')
    await servers.close()
  })
})
