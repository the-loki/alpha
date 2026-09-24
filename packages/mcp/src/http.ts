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

/** The events of a streamed answer: all `data:` fields of an SSE event form one JSON-RPC message. */
async function readStream(response: Response, handlers: FrameHandlers, originId?: number): Promise<void> {
  const body = response.body
  if (body === null) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let line = ''
  let afterCarriageReturn = false
  let data: string[] = []
  const endLine = (): void => {
    if (line === '') {
      if (data.length > 0) handlers.message(data.join('\n'), originId)
      data = []
    } else if (line === 'data') {
      data.push('')
    } else if (line.startsWith('data:')) {
      const value = line.slice('data:'.length)
      data.push(value.startsWith(' ') ? value.slice(1) : value)
    }
    line = ''
  }
  const readText = (text: string): void => {
    for (const character of text) {
      if (afterCarriageReturn) {
        afterCarriageReturn = false
        if (character === '\n') continue
      }
      if (character === '\r' || character === '\n') {
        endLine()
        afterCarriageReturn = character === '\r'
      } else {
        line += character
      }
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    readText(decoder.decode(value, { stream: true }))
  }
  readText(decoder.decode())
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
        if (answered.includes('text/event-stream')) await readStream(response, handlers, originId)
        else {
          const body = await response.text()
          if (body.trim() !== '') handlers.message(body, originId)
        }
        if (originId !== undefined) handlers.finished(originId)
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
