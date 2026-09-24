/**
 * The scripted MCP server: a real one, in a child process, speaking what the client has to speak —
 * newline-delimited JSON-RPC 2.0 on stdio, the handshake before any other method, a tool list that
 * comes back a page at a time, a tool that fails as a result, one that answers late, one that takes
 * the server down with it, and the cancellation notification a client that stops waiting is meant
 * to send. A fixture, but a server rather than a mock: what is under test is the transport that
 * talks to it. Test fixture only.
 *
 * `--die` makes it exit before answering anything, which is how a server that cannot start is met.
 * `SCRIPTED_MCP_MUTED`, when set, keeps it reading and never answering, which is how a server that
 * hangs is met. `SCRIPTED_MCP_MARKER`, when set, is where a cancellation is written down, so a test
 * can see that the client told the server to stop rather than only that it stopped waiting.
 * `SCRIPTED_MCP_NAME`, when set, is said back by `echo`, so a test can tell two servers apart.
 */

import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import type { Undef } from '@alpha/domain'

interface ScriptedTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ScriptedTool[] = [
  {
    name: 'echo',
    description: 'Answers with the text it was given.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'picture',
    description: 'Answers with a line of text and an image.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'boom',
    description: 'Answers with a failure, the way a tool that refuses does.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'slow',
    description: 'Answers after a while, unless it is told to stop.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'quit',
    description: 'Takes the server down without answering.',
    inputSchema: { type: 'object', properties: {} },
  },
]

/** The tool `grow` adds, so a list that was read before it can be seen to be stale. */
const GROWN: ScriptedTool = {
  name: 'grown',
  description: 'Was not offered when the list was last read.',
  inputSchema: { type: 'object', properties: {} },
}

/** One page, and the cursor that reaches the next — a server that pages its list, as they do. */
function listPage(cursor: unknown): Record<string, unknown> {
  const asked = Number(cursor)
  const from = Number.isInteger(asked) && asked > 0 ? asked : 0
  const page = TOOLS.slice(from, from + 1)
  const next = from + 1
  return next >= TOOLS.length ? { tools: page } : { tools: page, nextCursor: String(next) }
}

function write(message: object): void {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

if (process.argv.includes('--die')) process.exit(3)

/** The calls still running here, by request id: a cancellation has something to stop. */
const waiting = new Map<string, NodeJS.Timeout>()

let initialized = false

function cancelled(id: unknown): void {
  const timer = waiting.get(String(id))
  if (timer === undefined) return
  clearTimeout(timer)
  waiting.delete(String(id))
  const marker = process.env.SCRIPTED_MCP_MARKER
  if (marker !== undefined) writeFileSync(marker, `cancelled ${String(id)}`, 'utf-8')
}

function callOf(id: unknown, params: Record<string, unknown>): Undef<object> {
  const name = String(params.name ?? '')
  const args = params.arguments
  const given = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  if (name === 'quit') process.exit(4)
  if (name === 'grow') {
    TOOLS.push(GROWN)
    // The answer comes first and the notification after it, in the order a server would send them.
    const result = { content: [{ type: 'text', text: 'grew' }] }
    queueMicrotask(() => write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }))
    return { jsonrpc: '2.0', id, result }
  }
  if (name === 'echo') {
    const label = process.env.SCRIPTED_MCP_NAME ?? ''
    const text = `echo: ${label}${String(given.text ?? '')}`
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } }
  }
  if (name === 'picture') {
    const content = [
      { type: 'text', text: 'a picture' },
      { type: 'image', data: 'QUJD', mimeType: 'image/png' },
    ]
    return { jsonrpc: '2.0', id, result: { content } }
  }
  if (name === 'boom') {
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'the tool refused' }], isError: true } }
  }
  if (name === 'slow') {
    const timer = setTimeout(() => {
      waiting.delete(String(id))
      write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'slept' }] } })
    }, 400)
    waiting.set(String(id), timer)
    return undefined
  }
  return { jsonrpc: '2.0', id, error: { code: -32602, message: `no tool ${name}` } }
}

function answerOf(id: unknown, method: string, params: Record<string, unknown>): Undef<object> {
  if (method === 'initialize') {
    const result = {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'scripted', version: '1.0.0' },
    }
    return { jsonrpc: '2.0', id, result }
  }
  if (!initialized) return { jsonrpc: '2.0', id, error: { code: -32002, message: 'not initialized' } }
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: listPage(params.cursor) }
  if (method === 'tools/call') return callOf(id, params)
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `no method ${method}` } }
}

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return
  if (process.env.SCRIPTED_MCP_MUTED !== undefined) return
  const message = JSON.parse(line) as { id?: unknown; method?: string; params?: Record<string, unknown> }
  if (message.method === 'notifications/initialized') {
    initialized = true
    return
  }
  if (message.method === 'notifications/cancelled') {
    cancelled(message.params?.requestId)
    return
  }
  if (message.id === undefined || message.method === undefined) return
  const answer = answerOf(message.id, message.method, message.params ?? {})
  if (answer !== undefined) write(answer)
})
