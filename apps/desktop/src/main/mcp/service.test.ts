/**
 * The MCP servers the workbench is configured with, at the seam the settings page reads them
 * through: the file, the definitions it holds between one launch and the next, and the answers the
 * panel draws — each server, and how it went.
 *
 * The hub is a port here, so what is under test is the service's own half. What the real hub makes
 * of a definition is `@alpha/mcp`'s to say (its own tests run a real server), and `e2e/mcp.spec.ts`
 * is where the two halves meet in the running workbench.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServerDefinition } from '@alpha/domain'
import { type McpOutcome, type McpServers, readMcpServers, writeMcpServers } from '@alpha/mcp'
import { describe, expect, it } from 'vitest'
import { McpService } from './service.ts'

/** A data directory holding the given servers, written the way the panel writes them. */
function withServers(servers: McpServerDefinition[]): string {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-mcp-service-'))
  writeMcpServers(directory, servers)
  return directory
}

describe('[main] the MCP servers the workbench is configured with', () => {
  it('answers with what it is configured with before any of it has been reached', () => {
    const service = new McpService(withServers([{ name: 'files', command: 'mcp-files', args: ['/tmp'] }]))
    expect(service.snapshot()).toEqual({
      servers: [{ name: 'files', command: 'mcp-files', args: ['/tmp'], reached: { state: 'starting' } }],
    })
  })

  it('has nothing to say about a workbench with no servers file', () => {
    const service = new McpService(mkdtempSync(join(tmpdir(), 'alpha-mcp-service-')))
    expect(service.snapshot()).toEqual({ servers: [] })
  })

  it('says what each server offers once it has been reached, and why not when it could not be', async () => {
    const hub = hubOf([{ name: 'files', tools: 5 }])
    const service = new McpService(withServers([{ name: 'files', command: 'mcp-files' }]), { connect: hub.connect })
    await service.servers()
    expect(service.snapshot().servers).toEqual([
      { name: 'files', command: 'mcp-files', reached: { state: 'connected', tools: 5 } },
    ])
  })

  it('writes a server down and reaches it now, rather than at the next launch', async () => {
    const directory = withServers([{ name: 'files', command: 'mcp-files' }])
    const hub = hubOf()
    const service = new McpService(directory, { connect: hub.connect })

    await service.save({ name: 'hosted', url: 'http://127.0.0.1:8787/mcp' })

    // The file is what the panel owns, read back here with the reader the next launch uses.
    expect(readMcpServers(directory)).toEqual([
      { name: 'files', command: 'mcp-files' },
      { name: 'hosted', url: 'http://127.0.0.1:8787/mcp' },
    ])
    // And reaching it is the hub's half of "saved": an open conversation picks its tools up (C2.8).
    expect(hub.told.at(-1)?.map((server) => server.name)).toEqual(['files', 'hosted'])
    expect(service.snapshot().servers[1]?.reached).toEqual({ state: 'connected', tools: 5 })
  })

  it('refuses a server that is not one, with the sentence that says what is missing', async () => {
    const hub = hubOf()
    const service = new McpService(withServers([]), { connect: hub.connect })
    await expect(service.save({ name: 'Files', command: 'mcp-files' })).rejects.toThrow('lower-case')
    await expect(service.save({ name: 'files' })).rejects.toThrow('a server needs a command to run or a url to reach')
  })

  it('takes a server out of the list, and out of the hub', async () => {
    const directory = withServers([
      { name: 'files', command: 'mcp-files' },
      { name: 'hosted', url: 'http://127.0.0.1:8787/mcp' },
    ])
    const hub = hubOf()
    const service = new McpService(directory, { connect: hub.connect })

    await service.remove('files')

    expect(readMcpServers(directory)).toEqual([{ name: 'hosted', url: 'http://127.0.0.1:8787/mcp' }])
    expect(hub.told.at(-1)?.map((server) => server.name)).toEqual(['hosted'])
    await expect(service.remove('nobody')).rejects.toThrow('No MCP server nobody')
  })

  it('reaches one server again when it is asked to, and answers with what it says now', async () => {
    const hub = hubOf([{ name: 'ghost', tools: 0, problem: 'spawn nowhere ENOENT' }])
    const service = new McpService(withServers([{ name: 'ghost', command: 'nowhere' }]), { connect: hub.connect })

    expect(await service.reconnect('ghost')).toEqual({
      servers: [
        { name: 'ghost', command: 'nowhere', reached: { state: 'unreachable', problem: 'spawn nowhere ENOENT' } },
      ],
    })
    expect(hub.retried).toEqual(['ghost'])
  })
})

/**
 * A hub that behaves like one: it holds the list it was handed, counts five tools for each server
 * it holds, and remembers what it was told, so a test can see the service's half of the joint
 * without reaching into it.
 */
function hubOf(outcomes: McpOutcome[] = [{ name: 'files', tools: 5 }]) {
  const told: McpServerDefinition[][] = []
  const retried: string[] = []
  let current = outcomes
  const hub: McpServers = {
    tools: () => [],
    call: async () => ({ content: [], isError: false }),
    outcomes: () => current,
    onToolsChanged: () => {},
    reconfigure: async (definitions) => {
      told.push(definitions)
      current = definitions.map((server) => ({ name: server.name, tools: 5 }))
    },
    reconnect: async (name) => {
      retried.push(name)
    },
    close: async () => {},
  }
  return { hub, connect: async () => hub, told, retried }
}
