/**
 * One MCP server as this client meets it: the handshake, the tool list, and a call. The tool list is
 * read a page at a time, because a server may hold more tools than fit in one answer; a call's
 * result keeps the parts the server named, so text stays text and an image stays an image; and a
 * part this client has no shape for is passed on as what the server said rather than dropped.
 *
 * Nothing here knows where the server runs: it is handed a frame, and stdio or HTTP is the frame's
 * business. A server that cannot be reached is not this package's to announce — whether a missing
 * server is a problem belongs to whoever asked for it — so a connection that does not come up
 * answers Undef, and the workbench goes on without it.
 */

import type { Undef } from '@alpha/domain'
import { httpFrame } from './http.ts'
import { createSession, type McpSession } from './session.ts'
import { stdioFrame } from './stdio.ts'

/** How a workbench is told to reach one server: a command to run, or a URL to post to. */
export type McpServerDefinition =
  | { name: string; command: string; args?: string[]; env?: Record<string, string> }
  | { name: string; url: string; headers?: Record<string, string> }

export interface McpTool {
  server: string
  name: string
  description: string
  /** The server's own JSON Schema for the arguments, passed on as the tool's parameters. */
  inputSchema: unknown
}

export type McpContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

export interface McpCallResult {
  content: McpContent[]
  isError: boolean
}

export interface McpConnection {
  server: string
  tools: McpTool[]
  call(tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResult>
  close(): void
}

/** The version this client speaks. A server that offers another is still asked in this one's terms. */
const PROTOCOL_VERSION = '2025-06-18'

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

/** The parts of a result, in the shapes the model takes them. */
function contentOf(raw: unknown): McpContent[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((part): McpContent[] => {
    const record = recordOf(part)
    if (record.type === 'text') return [{ type: 'text', text: String(record.text ?? '') }]
    if (record.type === 'image') {
      return [{ type: 'image', data: String(record.data ?? ''), mimeType: String(record.mimeType ?? '') }]
    }
    // A resource or a link: a kind this client has no shape for, said the way the server said it.
    return [{ type: 'text', text: JSON.stringify(part) }]
  })
}

/** One page of the tool list, and the cursor that reaches the next when there is one. */
function pageOf(result: unknown, server: string): { tools: McpTool[]; cursor: Undef<string> } {
  const record = recordOf(result)
  const listed = Array.isArray(record.tools) ? record.tools : []
  return {
    tools: listed.flatMap((tool): McpTool[] => {
      const entry = recordOf(tool)
      const name = String(entry.name ?? '')
      if (name === '') return []
      return [
        {
          server,
          name,
          description: String(entry.description ?? ''),
          inputSchema: entry.inputSchema ?? { type: 'object', properties: {} },
        },
      ]
    }),
    cursor: typeof record.nextCursor === 'string' ? record.nextCursor : undefined,
  }
}

async function listTools(session: McpSession, server: string): Promise<McpTool[]> {
  const tools: McpTool[] = []
  let cursor: Undef<string>
  for (;;) {
    const page = pageOf(await session.request('tools/list', cursor === undefined ? {} : { cursor }), server)
    tools.push(...page.tools)
    cursor = page.cursor
    if (cursor === undefined) return tools
  }
}

/** What this client is, and the notification that says it is ready to be asked for anything. */
async function handshake(session: McpSession): Promise<void> {
  await session.request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'Alpha', version: '0.1.0' },
  })
  session.notify('notifications/initialized', {})
}

/** The handshake has to finish: a server that never answers must not hold the workbench at its boot. */
function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the MCP server did not answer within ${ms}ms`)), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/** The server a definition names, handshaken and listed, or nothing when it did not come up. */
export async function connect(definition: McpServerDefinition, timeoutMs: number): Promise<Undef<McpConnection>> {
  const session = createSession((handlers) =>
    'command' in definition ? stdioFrame(definition, handlers) : httpFrame(definition, handlers),
  )
  try {
    const ready = (async () => {
      await handshake(session)
      return await listTools(session, definition.name)
    })()
    const tools = await within(ready, timeoutMs)
    return {
      server: definition.name,
      tools,
      call: async (tool, args, signal) => {
        const record = recordOf(await session.request('tools/call', { name: tool, arguments: args }, signal))
        return { content: contentOf(record.content), isError: record.isError === true }
      },
      close: () => session.close(),
    }
  } catch {
    // Whatever went wrong, this server is not part of the workbench: let go of it and say nothing.
    session.close()
    return undefined
  }
}
