/**
 * The file the servers are configured in. A workbench with no `mcp.json` has no MCP servers, and a
 * file that is not a list of servers — or one entry in it that is neither a command nor a URL — is
 * not a reason for the agent to fail to start: what the file says is read as far as it goes.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readMcpServers, writeMcpServers } from './servers.ts'

/** A data directory holding this text as its servers file. */
function withFile(text: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'alpha-mcp-'))
  writeFileSync(join(directory, 'mcp.json'), text, 'utf-8')
  return directory
}

describe('the servers file', () => {
  it('reads a server that runs a command, and one that answers over HTTP', () => {
    const directory = withFile(
      JSON.stringify({
        servers: [
          { name: 'files', command: 'mcp-files', args: ['/tmp'], env: { HOME: '/tmp' } },
          { name: 'hosted', url: 'http://127.0.0.1:8787/mcp', headers: { authorization: 'Bearer x' } },
        ],
      }),
    )
    expect(readMcpServers(directory)).toEqual([
      { name: 'files', command: 'mcp-files', args: ['/tmp'], env: { HOME: '/tmp' } },
      { name: 'hosted', url: 'http://127.0.0.1:8787/mcp', headers: { authorization: 'Bearer x' } },
    ])
  })

  it('has no servers when there is no file', () => {
    expect(readMcpServers(mkdtempSync(join(tmpdir(), 'alpha-mcp-')))).toEqual([])
  })

  it('reads what it can out of a file that is partly nonsense', () => {
    const directory = withFile('{"servers": [{"name": "nameless"}, 7, {"name": "ok", "command": "mcp"}]}')
    expect(readMcpServers(directory)).toEqual([{ name: 'ok', command: 'mcp' }])
  })

  it('has no servers when the file is not JSON at all', () => {
    expect(readMcpServers(withFile('{ this is not json'))).toEqual([])
  })

  it('writes a list where it reads one from, so the settings page owns the file', () => {
    // What the panel writes is what the next launch reads: the file has one shape, and the writer
    // and the reader are the two halves of it.
    const directory = mkdtempSync(join(tmpdir(), 'alpha-mcp-'))
    writeMcpServers(directory, [
      { name: 'files', command: 'mcp-files', args: ['/tmp'], env: { HOME: '/tmp' } },
      { name: 'hosted', url: 'http://127.0.0.1:8787/mcp' },
    ])
    expect(readMcpServers(directory)).toEqual([
      { name: 'files', command: 'mcp-files', args: ['/tmp'], env: { HOME: '/tmp' } },
      { name: 'hosted', url: 'http://127.0.0.1:8787/mcp' },
    ])
  })

  it('writes no servers as no servers, not as a file nothing can read', () => {
    const directory = withFile('{"servers": [{"name": "files", "command": "mcp-files"}]}')
    writeMcpServers(directory, [])
    expect(readMcpServers(directory)).toEqual([])
  })
})
