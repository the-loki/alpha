/**
 * The MCP tools as a plugin face (ADR-0025): what the connected servers offer, turned into the
 * `AgentTool`s the assembled agent takes. The face names pi because a tool *is* an `AgentTool`, and
 * this package is one of the two allowed to (C2.0); everything about MCP itself — the transports,
 * the handshake, the list — is `@alpha/mcp`'s and stays there.
 *
 * The name carries the server, because two servers may each offer a tool called `read` and the
 * model has to be able to reach the one it means. The description and the parameters are the
 * server's own: the description is how the model decides, and the JSON Schema is the shape the
 * server promised to accept — rewriting either would be inventing a second one.
 *
 * A server may change what it offers while a conversation is running, and says so. The plugin
 * reports that change to its host, which reads every plugin's current tools and updates the live
 * agent. The host releases the subscription when the conversation closes.
 *
 * Nothing here decides whether a call is allowed. An MCP tool name is a name no rule knows, and
 * `toolRiskOf` reads a name it does not know as `execute`, the strictest class, so every one of
 * these goes through the gate like any other tool (C3.4) — which is the whole of the permission
 * story: there is nothing to add and nothing to remember to add.
 */

import type { McpCallResult, McpContent, McpServers, McpTool } from '@alpha/mcp'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { type TSchema, Type } from 'typebox'

export interface McpPluginPorts {
  /** The servers this workbench run holds, already connected: `main` makes one hub per run. */
  servers: McpServers
  conversationId: string
}

/** A plugin that carries one face: what the base needs to hang it on the agent. */
export interface McpPlugin {
  name: string
  tools: () => AgentTool[]
  onToolsChanged: (listener: () => void) => () => void
}

/** What every tool from a server is called. */
const MCP_PREFIX = 'mcp__'

/** The name the model sees: the server's in front of the tool's, so two servers cannot collide. */
export function mcpToolName(server: string, tool: string): string {
  return `${MCP_PREFIX}${wordOf(server)}__${wordOf(tool)}`
}

/** A name a provider will take: the characters a function name may carry, and nothing else. */
function wordOf(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/** What a failure says, in the words the model reads: the server's text, or the bare fact. */
function failureText(content: McpContent[]): string {
  const text = content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n')
    .trim()
  return text === '' ? 'the MCP tool reported a failure' : text
}

/**
 * The server's own schema as pi's. It arrives as JSON from outside, and this is the one place it
 * becomes a type: what the server promised is taken as the promise, and a server that wrote
 * something which is not a schema at all gets the shape every tool can be called with.
 */
function schemaOf(inputSchema: unknown): TSchema {
  return typeof inputSchema === 'object' && inputSchema !== null ? (inputSchema as TSchema) : Type.Object({})
}

/** The arguments the model sent, as the hub takes them: an object, whatever was asked for. */
function argumentsOf(params: unknown): Record<string, unknown> {
  return typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {}
}

function asAgentTool(ports: McpPluginPorts, tool: McpTool): AgentTool<TSchema, undefined> {
  return {
    name: mcpToolName(tool.server, tool.name),
    label: tool.name,
    description: tool.description,
    parameters: Type.Unsafe<Record<string, unknown>>(schemaOf(tool.inputSchema)),
    // A server may not be able to answer two calls at once, and one of these is a call to a server.
    executionMode: 'sequential',
    execute: async (toolCallId, params, signal) => {
      const context = {
        conversationId: ports.conversationId,
        toolCallId,
        toolName: mcpToolName(tool.server, tool.name),
      }
      const result: McpCallResult = await ports.servers.call(
        tool.server,
        tool.name,
        argumentsOf(params),
        signal,
        context,
      )
      // A result the server marked as a failure is the tool failing: pi reads a throw as the failed
      // tool result the model sees, which is how pi's own tools report one too.
      if (result.isError) throw new Error(failureText(result.content))
      return { content: result.content, details: undefined }
    },
  }
}

/** What the servers offer now, in the shape the agent takes. */
function offeredBy(ports: McpPluginPorts): AgentTool<TSchema, undefined>[] {
  return ports.servers.tools().map((tool) => asAgentTool(ports, tool))
}

/** The plugin: one tool per tool the servers offer, read when the agent is assembled or grown. */
export function createMcpPlugin(ports: McpPluginPorts): McpPlugin {
  return {
    name: 'mcp',
    tools: () => offeredBy(ports),
    onToolsChanged: (listener) => ports.servers.onToolsChanged(listener),
  }
}
