/**
 * Two servers at once: the hub hands back one flat list of tools that says which server each came
 * from, routes a call to the server that owns it, and refuses a server it does not hold. The two
 * children say their own name back, so a call landing on the wrong one would be visible.
 */

import type { McpServerDefinition } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
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

  it('says how each server went, and keeps the ones that came up', async () => {
    // Five tools is what the fixture offers before anything is asked of it; the second server is a
    // command no machine has, which is the ordinary way a configured server is simply not there.
    const servers = await connectMcpServers([
      scripted('one'),
      { name: 'ghost', command: 'a-command-that-is-not-there' },
    ])
    const outcomes = servers.outcomes()
    expect(outcomes.map((outcome) => outcome.name)).toEqual(['one', 'ghost'])
    expect(outcomes[0]).toEqual({ name: 'one', tools: 5 })
    expect(outcomes[1]?.tools).toBe(0)
    expect(outcomes[1]?.problem).toBeDefined()

    // The one that came up is still reached: a missing server costs the workbench its tools only.
    expect(servers.tools().some((tool) => tool.server === 'one' && tool.name === 'echo')).toBe(true)
    await servers.close()
  })

  it('takes a new list, and reaches only the part of it that is new', async () => {
    const servers = await connectMcpServers([scripted('one')])
    let heard = 0
    servers.onToolsChanged(() => {
      heard += 1
    })

    // `grow` is the fixture's sixth tool, offered to a client that asked for the list again: a
    // connection that survives the change still has it, and one that was made afresh does not.
    await servers.call('one', 'grow', {})
    await waitFor(() => servers.outcomes()[0]?.tools === 6)

    await servers.reconfigure([scripted('one'), scripted('two')])
    expect(servers.outcomes().map((outcome) => outcome.name)).toEqual(['one', 'two'])
    expect(servers.outcomes()[0]?.tools).toBe(6)
    expect(await servers.call('two', 'echo', { text: 'hello' })).toEqual({
      content: [{ type: 'text', text: 'echo: two-hello' }],
      isError: false,
    })
    expect(heard).toBeGreaterThan(0)

    // The same name with a different command is a different server: it is reached again, which is
    // how a server that answers differently under a name we already hold is not trusted from memory.
    await servers.reconfigure([scripted('one'), { name: 'two', command: 'a-command-that-is-not-there' }])
    expect(servers.outcomes()[0]?.tools).toBe(6)
    expect(servers.outcomes()[1]?.tools).toBe(0)
    expect(servers.outcomes()[1]?.problem).toBeDefined()

    // A server that is gone is gone: not in the list, and not routed to.
    await servers.reconfigure([])
    expect(servers.outcomes()).toEqual([])
    await expect(servers.call('one', 'echo', { text: 'hello' })).rejects.toThrow('no MCP server one')
    await servers.close()
  })

  it('reaches one server again when it is asked to', async () => {
    const servers = await connectMcpServers([scripted('one')])
    await servers.call('one', 'grow', {})
    await waitFor(() => servers.outcomes()[0]?.tools === 6)
    let heard = 0
    servers.onToolsChanged(() => {
      heard += 1
    })

    await servers.reconnect('one')
    // Five again: asking again means reaching it, not keeping what we had of it.
    expect(servers.outcomes()[0]?.tools).toBe(5)
    expect(heard).toBeGreaterThan(0)
    expect(await servers.call('one', 'echo', { text: 'hi' })).toEqual({
      content: [{ type: 'text', text: 'echo: one-hi' }],
      isError: false,
    })

    await expect(servers.reconnect('nobody')).rejects.toThrow('no MCP server nobody')
    await servers.close()
  })
})

/** Waits for the client to have heard about a change the server made on its own. */
async function waitFor(ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !ready(); attempt += 1) {
    await new Promise((resume) => setTimeout(resume, 10))
  }
}
