/**
 * The HTTP frame: one POST per message, which is how a hosted MCP server is spoken to. The answer
 * to a request is either a JSON body or a stream of events — the protocol allows both and a server
 * picks — so both are read here. A notification is answered with nothing at all: an empty body is
 * the answer to one, not a failure.
 *
 * The headers a definition carries go with every request, because a hosted server's token lives
 * there and nowhere else.
 */

import type { FrameHandlers, McpFrame } from './session.ts'

export interface HttpServer {
  url: string
  headers?: Record<string, string>
}

/** The events of a streamed answer: one JSON-RPC message per `data:` line, until the stream ends. */
async function readStream(response: Response, handlers: FrameHandlers): Promise<void> {
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
      if (trimmed.startsWith('data:')) handlers.message(trimmed.slice('data:'.length).trim())
    }
  }
}

export function httpFrame(server: HttpServer, handlers: FrameHandlers): McpFrame {
  return {
    send: async (text) => {
      const response = await fetch(server.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(server.headers ?? {}),
        },
        body: text,
      })
      if (!response.ok) throw new Error(`the MCP server answered ${response.status}`)
      const answered = response.headers.get('content-type') ?? ''
      if (answered.includes('text/event-stream')) return readStream(response, handlers)
      const body = await response.text()
      if (body.trim() !== '') handlers.message(body)
    },
    close: () => {
      // Nothing is held open between messages: an HTTP request is the whole of a connection.
    },
  }
}
