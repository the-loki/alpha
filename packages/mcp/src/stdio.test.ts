/**
 * The MCP client against a real server: `scripted-server.ts` in a child process, talking the
 * protocol over stdio. What is proved here is the transport and the protocol half — the handshake
 * before anything else, a tool list that comes back a page at a time, a call, a failure the server
 * reports as a result, a request the caller stops, a server that cannot start, and one that goes
 * away mid-session — because those are the things a person's turn depends on.
 */

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { McpServerDefinition } from '@alpha/domain'
import { describe, expect, it } from 'vitest'
import { connectMcpServers } from './servers.ts'

const SERVER = new URL('./scripted-server.ts', import.meta.url).pathname

/** The scripted server as a definition, with the fixture's own switches. */
function scripted(extra: string[] = [], env: Record<string, string> = {}): McpServerDefinition {
  return {
    name: 'scripted',
    command: process.execPath,
    args: ['--experimental-strip-types', SERVER, ...extra],
    env,
  }
}

/** The marker a cancellation is written to, and a wait for it: the file lands after the reply. */
async function markerText(path: string): Promise<string> {
  const until = Date.now() + 2000
  for (;;) {
    try {
      // Empty as well as absent counts as not yet: the file is created before it is written.
      const text = readFileSync(path, 'utf-8')
      if (text !== '') return text
    } catch {
      // Not there yet.
    }
    if (Date.now() > until) return ''
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** Waits for something that happens a message later than the call that caused it. */
async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('an MCP server over stdio', () => {
  it('lists what the server offers — paging through the list — and calls a tool', async () => {
    const servers = await connectMcpServers([scripted()])
    expect(servers.tools().map((tool) => [tool.server, tool.name])).toEqual([
      ['scripted', 'echo'],
      ['scripted', 'picture'],
      ['scripted', 'boom'],
      ['scripted', 'slow'],
      ['scripted', 'quit'],
    ])
    expect(servers.tools()[0]?.description).toBe('Answers with the text it was given.')
    expect(servers.tools()[0]?.inputSchema).toEqual({
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    })

    const result = await servers.call('scripted', 'echo', { text: 'hello' })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'echo: hello' }])
    await servers.close()
  })

  it('carries every part of a result, images among them', async () => {
    const servers = await connectMcpServers([scripted()])
    const result = await servers.call('scripted', 'picture', {})
    expect(result.content).toEqual([
      { type: 'text', text: 'a picture' },
      { type: 'image', data: 'QUJD', mimeType: 'image/png' },
    ])
    await servers.close()
  })

  it('keeps a failure the server reported, and refuses a method it does not have', async () => {
    const servers = await connectMcpServers([scripted()])
    const refused = await servers.call('scripted', 'boom', {})
    expect(refused.isError).toBe(true)
    expect(refused.content).toEqual([{ type: 'text', text: 'the tool refused' }])

    await expect(servers.call('scripted', 'nope', {})).rejects.toThrow('no tool nope')
    await servers.close()
  })

  it('re-lists when the server says its tools changed, and says so to whoever listens', async () => {
    const servers = await connectMcpServers([scripted()])
    const heard: string[][] = []
    servers.onToolsChanged(() => heard.push(servers.tools().map((tool) => tool.name)))
    expect(servers.tools().map((tool) => tool.name)).not.toContain('grown')

    await servers.call('scripted', 'grow', {})
    await until(() => heard.length > 0)

    expect(heard).toHaveLength(1)
    expect(heard[0]).toContain('grown')
    await servers.close()
  })

  it('stops waiting when the caller stops, and tells the server to stop as well', async () => {
    const marker = join(mkdtempSync(join(tmpdir(), 'alpha-mcp-')), 'cancelled.txt')
    const servers = await connectMcpServers([scripted([], { SCRIPTED_MCP_MARKER: marker })])
    const stop = new AbortController()
    const pending = servers.call('scripted', 'slow', {}, stop.signal)
    setTimeout(() => stop.abort(), 50)

    await expect(pending).rejects.toThrow(/stopped/)
    expect(await markerText(marker)).toMatch(/^cancelled /)
    await servers.close()
  })

  it('answers a call on a server that has gone away instead of hanging on it', async () => {
    const servers = await connectMcpServers([scripted()])
    await expect(servers.call('scripted', 'quit', {})).rejects.toThrow(/exited/)
    await servers.close()
  })

  it('leaves out a server that cannot start, and one that never answers', async () => {
    const servers = await connectMcpServers([scripted(['--die']), scripted([], { SCRIPTED_MCP_MUTED: '1' })], {
      timeoutMs: 300,
    })
    expect(servers.tools()).toEqual([])
    await servers.close()
  })

  it('lets go of its servers when the workbench closes', async () => {
    const servers = await connectMcpServers([scripted()])
    expect(servers.tools()).toHaveLength(5)
    await servers.close()
    await expect(servers.call('scripted', 'echo', { text: 'hello' })).rejects.toThrow(/closed/)
  })
})
