/**
 * The MCP servers as the workbench holds them: the file they are written in, the definitions the
 * settings page edits, and the hub that reaches them — one per run, connected once and reconfigured
 * when the list changes (ADR-0028).
 *
 * The hub is where a definition becomes a connection, and it is `@alpha/mcp`'s. This is the half
 * that belongs to the workbench: it owns the file (the panel is the other writer of it), it decides
 * that a save means "reach this now", and it turns the hub's outcomes into the one shape the window
 * draws. Every answer is the whole list, the same rule the providers panel works by, so the window
 * keeps one state instead of making a call after each edit.
 *
 * Nothing here decides whether a server may be used: an MCP tool is a tool like any other and goes
 * through the gate by name (C3.4), which is not this service's business at all.
 */

import type { McpReached, McpSnapshotMessage } from '@alpha/contract'
import { type McpServerDefinition, readMcpServer, type Undef } from '@alpha/domain'
import { connectMcpServers, type McpRequestHandler, type McpServers, readMcpServers, writeMcpServers } from '@alpha/mcp'

export class McpService {
  private readonly dataDirectory: string
  private readonly connect: (definitions: McpServerDefinition[]) => Promise<McpServers>
  /** What the panel shows: the file, read once and kept as the list the hub was last given. */
  private definitions: McpServerDefinition[]
  private connection: Undef<Promise<McpServers>>
  /** The hub itself, once it is up, so a snapshot does not have to wait for it. */
  private hub: Undef<McpServers>

  public constructor(
    dataDirectory: string,
    options: {
      connect?: (definitions: McpServerDefinition[]) => Promise<McpServers>
      onRequest?: McpRequestHandler
    } = {},
  ) {
    this.dataDirectory = dataDirectory
    this.connect =
      options.connect ?? ((definitions) => connectMcpServers(definitions, { onRequest: options.onRequest }))
    this.definitions = readMcpServers(dataDirectory)
  }

  /**
   * The hub of this run. It is reached once and awaited wherever it is needed — `main` starts it at
   * boot and every conversation that opens waits here — so a server is one child process for the
   * whole run rather than one per conversation.
   */
  public servers(): Promise<McpServers> {
    this.connection ??= this.connect(this.definitions).then((servers) => {
      this.hub = servers
      return servers
    })
    return this.connection
  }

  /** What the settings page draws: each configured server, and how it went. */
  public snapshot(): McpSnapshotMessage {
    const outcomes = this.hub?.outcomes() ?? []
    return {
      servers: this.definitions.map((definition) => ({
        ...definition,
        reached: reachedOf(outcomes.find((outcome) => outcome.name === definition.name)),
      })),
    }
  }

  /** One server added or corrected. Its name is its identity, so a save replaces what is under it. */
  public async save(input: unknown): Promise<McpSnapshotMessage> {
    const result = readMcpServer(input)
    if (result.server === undefined) throw new Error(result.error ?? 'the server is not valid')
    const server = result.server
    const at = this.definitions.findIndex((it) => it.name === server.name)
    // Edited where it stands rather than moved to the end: the panel draws this order, and a card
    // that jumps to the bottom of the list when it is saved is a list nobody can keep their place in.
    const next =
      at === -1 ? [...this.definitions, server] : this.definitions.map((it, index) => (index === at ? server : it))
    return await this.configure(next)
  }

  public async remove(name: string): Promise<McpSnapshotMessage> {
    if (!this.definitions.some((server) => server.name === name)) throw new Error(`No MCP server ${name}`)
    return await this.configure(this.definitions.filter((server) => server.name !== name))
  }

  /** Reaching one again: a server that was down, or a command that has since been installed. */
  public async reconnect(name: string): Promise<McpSnapshotMessage> {
    await (await this.servers()).reconnect(name)
    return this.snapshot()
  }

  /**
   * A new list: written down, handed to the hub, and answered with. Writing it first is what makes
   * the file and the run agree — a save that reached but did not write would be gone at the next
   * launch, and the settings page is the file's editor now.
   */
  private async configure(definitions: McpServerDefinition[]): Promise<McpSnapshotMessage> {
    writeMcpServers(this.dataDirectory, definitions)
    this.definitions = definitions
    await (await this.servers()).reconfigure(definitions)
    return this.snapshot()
  }
}

/** How one server went, as the panel reads it: connected with what it offers, or why it is not. */
function reachedOf(outcome: Undef<{ tools: number; problem?: string }>): McpReached {
  if (outcome === undefined) return { state: 'starting' }
  return outcome.problem === undefined
    ? { state: 'connected', tools: outcome.tools }
    : { state: 'unreachable', problem: outcome.problem }
}
