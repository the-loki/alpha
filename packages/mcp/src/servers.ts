/**
 * The servers a workbench holds: where they are written down, and the connections that come of it.
 *
 * The file is `mcp.json` in the data directory, beside the workbench's own files, and it is read
 * the way Alpha reads anything a person may have edited: as far as it goes. No file is no servers;
 * an entry that is neither a command nor a URL is left out; a file that is not JSON is not a reason
 * for the agent to fail to start.
 *
 * The hub is one per workbench run rather than one per conversation. A conversation is opened and
 * closed as the person moves around the window, and a server is a child process or an endpoint that
 * should not be started again for each one: `main` keeps this for the run and closes it at quit.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Undef } from '@alpha/domain'
import { connect, type McpCallResult, type McpServerDefinition, type McpTool } from './client.ts'

/** A record of strings — environment variables, headers — as far as the file got it right. */
function stringsOf(value: unknown): Undef<Record<string, string>> {
  if (typeof value !== 'object' || value === null) return undefined
  const pairs = Object.entries(value as Record<string, unknown>).flatMap(([key, item]): [string, string][] =>
    typeof item === 'string' ? [[key, item]] : [],
  )
  return pairs.length === 0 ? undefined : Object.fromEntries(pairs)
}

function listOf(value: unknown): Undef<string[]> {
  if (!Array.isArray(value)) return undefined
  return value.every((item) => typeof item === 'string') ? value : undefined
}

/** One entry of the file as a definition, or nothing when it names no way to reach a server. */
function definitionOf(entry: unknown): Undef<McpServerDefinition> {
  if (typeof entry !== 'object' || entry === null) return undefined
  const record = entry as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name : ''
  if (name === '') return undefined
  if (typeof record.url === 'string') return { name, url: record.url, headers: stringsOf(record.headers) }
  if (typeof record.command === 'string') {
    return { name, command: record.command, args: listOf(record.args), env: stringsOf(record.env) }
  }
  return undefined
}

/** The servers a workbench's `mcp.json` names, read as far as the file goes. */
export function readMcpServers(dataDirectory: string): McpServerDefinition[] {
  let text = ''
  try {
    text = readFileSync(join(dataDirectory, 'mcp.json'), 'utf-8')
  } catch {
    // No file at all: this workbench reaches no MCP server, which is the ordinary case.
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const servers =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).servers : undefined
  if (!Array.isArray(servers)) return []
  return servers.flatMap((entry): McpServerDefinition[] => {
    const definition = definitionOf(entry)
    return definition === undefined ? [] : [definition]
  })
}

/** What every open conversation reaches MCP tools through: the list, a call, and the way out. */
export interface McpServers {
  /** The tools as they stand now, read when they are asked for: a server may change its list. */
  tools(): McpTool[]
  call(server: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResult>
  /** Told when any server's tool list changes, so what is already assembled can be brought up to date. */
  onToolsChanged(listener: () => void): void
  close(): Promise<void>
}

/** How long a server has before the workbench stops waiting for it and goes on without it. */
const CONNECT_TIMEOUT_MS = 5_000

/**
 * Connects the configured servers and holds them. One that cannot be reached — a command that is
 * not there, an endpoint that refuses, one that never answers — is left out: a workbench is not
 * broken by a server being down, and the tools of the others are still worth having.
 *
 * They are reached at the same time rather than one after another, so a server that hangs costs the
 * wait once instead of once per server: the first conversation opened is the one that pays it.
 */
export async function connectMcpServers(
  definitions: McpServerDefinition[],
  options: { timeoutMs?: number } = {},
): Promise<McpServers> {
  const timeoutMs = options.timeoutMs ?? CONNECT_TIMEOUT_MS
  const listeners: Array<() => void> = []
  function announce(): void {
    for (const listener of listeners) listener()
  }
  const reached = await Promise.all(definitions.map((definition) => connect(definition, timeoutMs, announce)))
  const held = reached.flatMap((connection) => (connection === undefined ? [] : [connection]))
  return {
    tools: () => held.flatMap((connection) => connection.tools()),
    call: (server, tool, args, signal) => {
      const connection = held.find((it) => it.server === server)
      if (connection === undefined) return Promise.reject(new Error(`no MCP server ${server}`))
      return connection.call(tool, args, signal)
    },
    onToolsChanged: (listener) => {
      listeners.push(listener)
    },
    close: async () => {
      for (const connection of held) connection.close()
    },
  }
}
