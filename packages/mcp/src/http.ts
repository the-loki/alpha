/**
 * The HTTP frame: one POST per message, which is how a hosted MCP server is spoken to. The answer
 * to a request is either a JSON body or a stream of events — the protocol allows both and a server
 * picks — so both are read here. A notification is answered with nothing at all: an empty body is
 * the answer to one, not a failure.
 *
 * The headers a definition carries go with every request, because a hosted server's token lives
 * there and nowhere else.
 */

import type { Undef } from '@alpha/domain'
import type { FrameHandlers, McpFrame } from './session.ts'

export interface HttpServer {
  url: string
  headers?: Record<string, string>
}

/** The events of a streamed answer: one JSON-RPC message per `data:` line, until the stream ends. */
async function readStream(response: Response, handlers: FrameHandlers, originId?: number): Promise<void> {
  const body = response.body
  if (body === null) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data:')) handlers.message(trimmed.slice('data:'.length).trim(), originId)
    }
  }
}

function requestHeaders(server: HttpServer, version: string, sessionId: Undef<string>): Headers {
  const headers = new Headers(server.headers)
  headers.set('content-type', 'application/json')
  headers.set('accept', 'application/json, text/event-stream')
  headers.set('Mcp-Protocol-Version', version)
  if (sessionId !== undefined) headers.set('Mcp-Session-Id', sessionId)
  return headers
}

export function httpFrame(server: HttpServer, handlers: FrameHandlers, version: string): McpFrame {
  const pending = new Set<AbortController>()
  let sessionId: Undef<string>
  let closed = false
  return {
    send: async (text, originId, signal) => {
      if (closed) throw new Error('the MCP connection is closed')
      const controller = new AbortController()
      const abort = (): void => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted === true) controller.abort()
      pending.add(controller)
      try {
        const response = await fetch(server.url, {
          method: 'POST',
          headers: requestHeaders(server, version, sessionId),
          body: text,
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`the MCP server answered ${response.status}`)
        const assigned = response.headers.get('Mcp-Session-Id')
        if (sessionId === undefined && assigned !== null && assigned !== '') sessionId = assigned
        const answered = response.headers.get('content-type') ?? ''
        if (answered.includes('text/event-stream')) return await readStream(response, handlers, originId)
        const body = await response.text()
        if (body.trim() !== '') handlers.message(body, originId)
      } finally {
        pending.delete(controller)
        signal?.removeEventListener('abort', abort)
      }
    },
    close: () => {
      closed = true
      for (const controller of pending) controller.abort()
    },
  }
}
