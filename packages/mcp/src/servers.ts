/**
 * The servers a workbench holds: where they are written down, and the connections that come of it.
 *
 * The file is `mcp.json` in the data directory, beside the workbench's own files, and it is read
 * the way Alpha reads anything a person may have edited: as far as it goes. No file is no servers;
 * an entry that is neither a command nor a URL is left out; a file that is not JSON is not a reason
 * for the agent to fail to start. What an entry *is* is `@alpha/domain`'s rule (`readMcpServer`),
 * because the settings page is the other writer of this file and a server written there has to be
 * a server read here.
 *
 * The hub is one per workbench run rather than one per conversation. A conversation is opened and
 * closed as the person moves around the window, and a server is a child process or an endpoint that
 * should not be started again for each one: `main` keeps this for the run and closes it at quit.
 * The configured list can change while it runs — that is what the settings page does — so the hub
 * answers with what it holds (`outcomes`) and takes a new list (`reconfigure`) without being
 * rebuilt.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type McpServerDefinition, readMcpServer, sameMcpServer, type Undef } from '@alpha/domain'
import { connect, type McpCallResult, type McpConnection, type McpTool } from './client.ts'
import type { McpCallContext, McpRequestHandler } from './inbound.ts'

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
    const result = readMcpServer(entry)
    return result.server === undefined ? [] : [result.server]
  })
}

/**
 * The whole list, written where it was read from. The settings page is the writer now, so an entry
 * it cannot read is not kept as text it cannot show: the file holds exactly what the page holds.
 */
export function writeMcpServers(dataDirectory: string, definitions: McpServerDefinition[]): void {
  writeFileSync(join(dataDirectory, 'mcp.json'), `${JSON.stringify({ servers: definitions }, null, 2)}\n`, 'utf-8')
}

/** How one configured server went: what it offers when it was reached, or why it was not. */
export interface McpOutcome {
  name: string
  /** How many tools it offers. Zero unless it was reached. */
  tools: number
  /** Why it could not be reached, in the words of whatever refused. Absent when it was reached. */
  problem?: string
}

/** What every open conversation reaches MCP tools through: the list, a call, and the way out. */
export interface McpServers {
  /** The tools as they stand now, read when they are asked for: a server may change its list. */
  tools(): McpTool[]
  call(
    server: string,
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    context?: McpCallContext,
  ): Promise<McpCallResult>
  /** How each configured server went, in the order it was configured. */
  outcomes(): McpOutcome[]
  /**
   * What is configured changed: a server that came back unchanged keeps the connection it has, one
   * that is gone is let go, and a new one is reached. What is already assembled is told when the
   * membership really moved, so an open conversation picks the change up (C2.8).
   */
  reconfigure(definitions: McpServerDefinition[]): Promise<void>
  /**
   * Reaches one server again, letting go of the connection it had — what a person presses when a
   * server was down and is not any more, and the only way to find out other than restarting.
   */
  reconnect(name: string): Promise<void>
  /** Told when any server's tool list changes, so what is already assembled can be brought up to date. */
  onToolsChanged(listener: () => void): () => void
  close(): Promise<void>
}

/** One server of the configured list, and the connection it has — or why it has none. */
interface HeldServer {
  definition: McpServerDefinition
  connection: Undef<McpConnection>
  problem?: string
}

/**
 * What one run's servers are held in, and the two things reaching one needs: how long to wait, and
 * who to tell when what is held moves. It is a value rather than a closure over `connectMcpServers`
 * because the functions that keep it true are the bulk of this file, and the hub's own body is then
 * the table of what it answers (C2.5).
 */
interface Held {
  servers: HeldServer[]
  timeoutMs: number
  announce: () => void
  onRequest?: McpRequestHandler
}

/** How long a server has before the workbench stops waiting for it and goes on without it. */
const CONNECT_TIMEOUT_MS = 5_000

/** One server, reached: the connection it came up with, and what refused when it did not. */
async function reach(state: Held, definition: McpServerDefinition): Promise<HeldServer> {
  try {
    return { definition, connection: await connect(definition, state.timeoutMs, state.announce, state.onRequest) }
  } catch (error) {
    return { definition, connection: undefined, problem: error instanceof Error ? error.message : String(error) }
  }
}

/** The connections that are up. A server that was not reached is not one of them. */
function live(state: Held): McpConnection[] {
  return state.servers.flatMap((server) => (server.connection === undefined ? [] : [server.connection]))
}

/**
 * The list as it is now: what came back identical keeps the connection it has, and everything else
 * is reached afresh. What is left over when the list has been walked is what is no longer configured
 * — or what changed under a name we already held — and is let go.
 */
async function configure(state: Held, next: McpServerDefinition[]): Promise<void> {
  const previous = state.servers
  const reusable = [...previous]
  const reached: HeldServer[] = []
  for (const definition of next) {
    const at = reusable.findIndex(
      (server) => server.connection !== undefined && sameMcpServer(server.definition, definition),
    )
    const [carried] = at === -1 ? [] : reusable.splice(at, 1)
    // Two identical entries in the file are one server asked for twice, and a name is what a call is
    // routed by, so the second is reached on its own rather than handed the first one's.
    reached.push(carried ?? (await reach(state, definition)))
  }
  for (const server of reusable) server.connection?.close()
  state.servers = reached
  // Only when the membership moved: a save that changed nothing must not tell the agent its tools
  // changed, or every open conversation would be handed a change that was not one.
  if (reached.length !== previous.length || reached.some((server, at) => server !== previous[at])) {
    state.announce()
  }
}

/** That one server, reached as if it had never been: no other server is touched. */
async function reconnect(state: Held, name: string): Promise<void> {
  const at = state.servers.findIndex((server) => server.definition.name === name)
  const server = at === -1 ? undefined : state.servers[at]
  if (server === undefined) throw new Error(`no MCP server ${name}`)
  server.connection?.close()
  state.servers.splice(at, 1, await reach(state, server.definition))
  state.announce()
}

/** A call, to the server that owns the name, or the refusal of a name nobody holds. */
function called(
  state: Held,
  server: string,
  tool: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  context?: McpCallContext,
): Promise<McpCallResult> {
  const connection = live(state).find((it) => it.server === server)
  if (connection === undefined) return Promise.reject(new Error(`no MCP server ${server}`))
  return connection.call(tool, args, signal, context)
}

/**
 * Connects the configured servers and holds them. One that cannot be reached — a command that is
 * not there, an endpoint that refuses, one that never answers — is left out: a workbench is not
 * broken by a server being down, and the tools of the others are still worth having. What went
 * wrong is kept rather than dropped, because the settings page is where a person fixes it.
 *
 * They are reached at the same time rather than one after another, so a server that hangs costs the
 * wait once instead of once per server: the first conversation opened is the one that pays it.
 */
export async function connectMcpServers(
  definitions: McpServerDefinition[],
  options: { timeoutMs?: number; onRequest?: McpRequestHandler } = {},
): Promise<McpServers> {
  const listeners = new Set<() => void>()
  const state: Held = {
    servers: [],
    timeoutMs: options.timeoutMs ?? CONNECT_TIMEOUT_MS,
    onRequest: options.onRequest,
    announce: () => {
      for (const listener of listeners) listener()
    },
  }
  state.servers = await Promise.all(definitions.map((definition) => reach(state, definition)))
  return {
    tools: () => live(state).flatMap((connection) => connection.tools()),
    call: (server, tool, args, signal, context) => called(state, server, tool, args, signal, context),
    outcomes: () =>
      state.servers.map((server) => ({
        name: server.definition.name,
        tools: server.connection?.tools().length ?? 0,
        ...(server.problem === undefined ? {} : { problem: server.problem }),
      })),
    reconfigure: (next) => configure(state, next),
    reconnect: (name) => reconnect(state, name),
    onToolsChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    close: async () => {
      listeners.clear()
      for (const connection of live(state)) connection.close()
    },
  }
}
