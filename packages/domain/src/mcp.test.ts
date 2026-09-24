/**
 * An MCP server as data: the two ways one is reached, and the name it is known by. The name is an
 * id — it prefixes every tool the server offers (`mcp__<server>__<tool>`), so two servers whose
 * names differ by a character a provider would drop are two servers the model could not tell
 * apart. `readMcpServer` is also the reader of `mcp.json`, so one rule serves the file a person
 * wrote and the form a person is filling in.
 */

import { describe, expect, it } from 'vitest'
import { type McpServerDefinition, readMcpServer, sameMcpServer } from './mcp.ts'

describe('[domain] reading a server', () => {
  it('reads a command to run with its arguments and environment', () => {
    const result = readMcpServer({
      name: 'files',
      command: 'mcp-files',
      args: ['/tmp', '--read-only'],
      env: { HOME: '/tmp' },
    })
    expect(result).toEqual({
      server: { name: 'files', command: 'mcp-files', args: ['/tmp', '--read-only'], env: { HOME: '/tmp' } },
    })
  })

  it('reads a url to reach with its headers', () => {
    const result = readMcpServer({ name: 'hosted', url: 'http://127.0.0.1:8787/mcp', headers: { a: 'b' } })
    expect(result).toEqual({ server: { name: 'hosted', url: 'http://127.0.0.1:8787/mcp', headers: { a: 'b' } } })
  })

  it('refuses a url that is not an http address', () => {
    // The endpoint is what the client posts to, so anything else is a server that could never be
    // reached — said here, where the person is typing, rather than at the first conversation.
    expect(readMcpServer({ name: 'hosted', url: 'ftp://example.test/mcp' }).server).toBeUndefined()
  })

  // The ways a server cannot be one. Two of these are guards: the rules came in with the reading
  // above, and the settings form is where a person meets them.
  it('refuses a server with no name, or a name that is not an id', () => {
    expect(readMcpServer({ command: 'mcp-files' }).error).toBeDefined()
    expect(readMcpServer({ name: 'My Files', command: 'mcp-files' }).error).toBeDefined()
  })

  it('refuses a name that would collide with the names of the tools it offers', () => {
    // A tool is `mcp__<server>__<tool>`, so a name carrying the separator would make two different
    // servers' tools indistinguishable — as `a__b`'s `read` and `a`'s `b__read` both are.
    expect(readMcpServer({ name: 'a__b', command: 'mcp-files' }).error).toBeDefined()
  })

  it('refuses a server that names neither a command nor a url', () => {
    expect(readMcpServer({ name: 'files' }).error).toBeDefined()
  })
})

describe('[domain] telling two definitions apart', () => {
  const base: McpServerDefinition = { name: 'files', command: 'mcp-files', args: ['/tmp'] }

  it('is the same server when every field is the same, whatever the order of the pairs', () => {
    expect(sameMcpServer(base, { name: 'files', command: 'mcp-files', args: ['/tmp'] })).toBe(true)
    expect(
      sameMcpServer(
        { name: 'hosted', url: 'http://x/mcp', headers: { a: '1', b: '2' } },
        { name: 'hosted', url: 'http://x/mcp', headers: { b: '2', a: '1' } },
      ),
    ).toBe(true)
  })

  it('is a different server as soon as any field of it changed', () => {
    expect(sameMcpServer(base, { name: 'files', command: 'other' })).toBe(false)
    expect(sameMcpServer(base, { name: 'files', command: 'mcp-files' })).toBe(false)
    expect(sameMcpServer(base, { name: 'files', command: 'mcp-files', args: ['/tmp', '--read-only'] })).toBe(false)
    expect(sameMcpServer(base, { name: 'files', command: 'mcp-files', args: ['/tmp'], env: { A: '1' } })).toBe(false)
    expect(sameMcpServer(base, { name: 'files', url: 'http://x/mcp' })).toBe(false)
  })
})
