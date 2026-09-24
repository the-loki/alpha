/**
 * The HTTP transport against a real server: one that answers with a JSON body, one that answers
 * with a stream of events, and one that fails. The client has to read both kinds of answer — the
 * current protocol answers a request either way — and hand the headers a definition carries to the
 * server, because that is how a hosted MCP server is authenticated.
 */

import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { McpServerRequest } from './inbound.ts'
import { connectMcpServers } from './servers.ts'

/** Every request the server saw, so a test can say what the client actually sent. */
const seen: { method?: string; authorization?: string; sessionId?: string; version?: string; body: string }[] = []
const reverseReplies = new Map<unknown, (reply: Record<string, unknown>) => void>()

const answerFor = (message: { id: unknown; method?: string; params?: Record<string, unknown> }): object => {
  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'remote', version: '1' },
      },
    }
  }
  if (message.method === 'tools/list') {
    const tool = { name: 'reach', description: 'Reaches out.', inputSchema: { type: 'object', properties: {} } }
    return { jsonrpc: '2.0', id: message.id, result: { tools: [tool] } }
  }
  const name = String(message.params?.name ?? '')
  return { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `reached ${name}` }] } }
}

let server: Server
let origin = ''

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += String(chunk)
    })
    request.on('end', () => {
      const message = JSON.parse(body) as {
        id?: unknown
        method?: string
        params?: Record<string, unknown>
        error?: { code?: number }
      }
      seen.push({
        method: message.method,
        authorization: request.headers.authorization,
        sessionId: request.headers['mcp-session-id'] as string | undefined,
        version: request.headers['mcp-protocol-version'] as string | undefined,
        body,
      })
      if (
        (request.url === '/session' || request.url === '/reverse-answered' || request.url === '/sample-answered') &&
        message.method !== 'initialize'
      ) {
        if (
          request.headers['mcp-session-id'] !== 'alpha-test-session' ||
          request.headers['mcp-protocol-version'] !== '2025-06-18'
        ) {
          response.writeHead(400).end('session headers missing')
          return
        }
      }
      if (request.url === '/broken') {
        response.writeHead(500).end('no')
        return
      }
      // A notification has no id and is answered with nothing, which the protocol says is a 202.
      if (message.id === undefined) {
        response.writeHead(202).end()
        return
      }
      if (message.method === undefined) {
        if (request.url === '/reverse-answered' || request.url === '/sample-answered') {
          reverseReplies.get(message.id)?.(message as Record<string, unknown>)
          reverseReplies.delete(message.id)
        }
        response.writeHead(202).end()
        return
      }
      const answer = JSON.stringify(answerFor({ ...message, id: message.id }))
      if (request.url === '/reverse-answered' && message.method === 'tools/call') {
        const reverse = JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          method: 'elicitation/create',
          params: { message: 'Name?' },
        })
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write(`event: message\ndata: ${reverse}\n\n`)
        reverseReplies.set(message.id, (reply) => {
          const result = JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: { content: [{ type: 'text', text: JSON.stringify(reply.result ?? reply.error) }] },
          })
          response.end(`event: message\ndata: ${result}\n\n`)
        })
        return
      }
      if (request.url === '/sample-answered' && message.method === 'tools/call') {
        const reverse = JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          method: 'sampling/createMessage',
          params: {
            messages: [{ role: 'user', content: { type: 'text', text: 'Server prompt' } }],
            maxTokens: 32,
          },
        })
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write(`event: message\ndata: ${reverse}\n\n`)
        reverseReplies.set(message.id, (reply) => {
          const result = JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: { content: [{ type: 'text', text: JSON.stringify(reply.result ?? reply.error) }] },
          })
          response.end(`event: message\ndata: ${result}\n\n`)
        })
        return
      }
      if (request.url === '/reverse-cancelled' && message.method === 'tools/call') {
        const reverse = JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          method: 'elicitation/create',
          params: { message: 'Name?' },
        })
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write(`event: message\ndata: ${reverse}\n\n`)
        setTimeout(() => {
          const cancelled = JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/cancelled',
            params: { requestId: message.id },
          })
          const result = JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: { content: [{ type: 'text', text: 'cancelled by server' }] },
          })
          response.end(`event: message\ndata: ${cancelled}\n\nevent: message\ndata: ${result}\n\n`)
        }, 20)
        return
      }
      if (request.url === '/reverse' && message.method === 'tools/call') {
        const reverse = JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          method: 'sampling/createMessage',
          params: { messages: [] },
        })
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write(`event: message\ndata: ${reverse}\n\n`)
        setTimeout(() => response.end(`event: message\ndata: ${answer}\n\n`), 50)
        return
      }
      if (request.url === '/stream') {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(`event: message\ndata: ${answer}\n\n`)
        return
      }
      response.writeHead(200, {
        'content-type': 'application/json',
        ...((request.url === '/session' || request.url === '/reverse-answered' || request.url === '/sample-answered') &&
        message.method === 'initialize'
          ? { 'Mcp-Session-Id': 'alpha-test-session' }
          : {}),
      })
      response.end(answer)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  origin = typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : ''
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('an MCP server over HTTP', () => {
  it('returns a sampling response through a separate HTTP POST for the parent tool call', async () => {
    const asked: McpServerRequest[] = []
    const servers = await connectMcpServers([{ name: 'remote', url: `${origin}/sample-answered` }], {
      onRequest: async (request) => {
        asked.push(request)
        return { role: 'assistant', content: { type: 'text', text: 'Reviewed answer' }, model: 'm' }
      },
    })
    try {
      const result = await servers.call('remote', 'reach', {}, undefined, {
        conversationId: 'conversation-1',
        toolCallId: 'call-1',
      })
      expect(asked).toMatchObject([
        {
          server: 'remote',
          method: 'sampling/createMessage',
          params: { messages: [{ role: 'user', content: { type: 'text', text: 'Server prompt' } }], maxTokens: 32 },
          context: { conversationId: 'conversation-1', toolCallId: 'call-1' },
        },
      ])
      expect(result.content).toEqual([
        {
          type: 'text',
          text: JSON.stringify({ role: 'assistant', content: { type: 'text', text: 'Reviewed answer' }, model: 'm' }),
        },
      ])
      expect(seen.some((request) => request.body.includes('Reviewed answer') && request.method === undefined)).toBe(
        true,
      )
    } finally {
      await servers.close()
    }
  })

  it('aborts an unanswered server request when the HTTP stream cancels it', async () => {
    const asked: McpServerRequest[] = []
    const servers = await connectMcpServers([{ name: 'remote', url: `${origin}/reverse-cancelled` }], {
      onRequest: async (request) => {
        asked.push(request)
        return await new Promise(() => {})
      },
    })
    const result = await servers.call('remote', 'reach', {}, undefined, {
      conversationId: 'conversation-1',
      toolCallId: 'call-1',
    })
    expect(asked).toHaveLength(1)
    expect(asked[0]?.signal.aborted).toBe(true)
    expect(result.content).toEqual([{ type: 'text', text: 'cancelled by server' }])
    await servers.close()
  })

  it('carries the negotiated protocol and server session on later POSTs', async () => {
    const servers = await connectMcpServers([{ name: 'remote', url: `${origin}/session` }])
    expect(servers.tools().map((tool) => tool.name)).toEqual(['reach'])
    expect((await servers.call('remote', 'reach', {})).content).toEqual([{ type: 'text', text: 'reached reach' }])
    const calls = seen.filter((request) => request.method === 'tools/call')
    expect(calls.at(-1)).toMatchObject({ sessionId: 'alpha-test-session', version: '2025-06-18' })
    await servers.close()
  })

  it('refuses an HTTP server request without a parent tool-call identity', async () => {
    const asked: McpServerRequest[] = []
    const servers = await connectMcpServers([{ name: 'remote', url: `${origin}/reverse-answered` }], {
      onRequest: async (request) => {
        asked.push(request)
        return { action: 'accept' }
      },
    })
    const result = await servers.call('remote', 'reach', {})
    expect(asked).toEqual([])
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Cannot attribute') })
    await servers.close()
  })

  it('routes concurrent server requests to their originating conversations and answers by a new POST', async () => {
    const asked: McpServerRequest[] = []
    const servers = await connectMcpServers([{ name: 'remote', url: `${origin}/reverse-answered` }], {
      onRequest: async (request) => {
        asked.push(request)
        return { action: 'accept', content: { name: request.context.conversationId } }
      },
    })
    const [first, second] = await Promise.all([
      servers.call('remote', 'reach', {}, undefined, { conversationId: 'first', toolCallId: 'call-1' }),
      servers.call('remote', 'reach', {}, undefined, { conversationId: 'second', toolCallId: 'call-2' }),
    ])

    expect(asked.map((request) => [request.server, request.method, request.context])).toEqual([
      ['remote', 'elicitation/create', { conversationId: 'first', toolCallId: 'call-1' }],
      ['remote', 'elicitation/create', { conversationId: 'second', toolCallId: 'call-2' }],
    ])
    expect(first.content).toEqual([
      { type: 'text', text: JSON.stringify({ action: 'accept', content: { name: 'first' } }) },
    ])
    expect(second.content).toEqual([
      { type: 'text', text: JSON.stringify({ action: 'accept', content: { name: 'second' } }) },
    ])
    const answers = seen.filter(
      (request) =>
        request.method === undefined && (JSON.parse(request.body) as { result?: unknown }).result !== undefined,
    )
    expect(answers.slice(-2)).toEqual([
      expect.objectContaining({ sessionId: 'alpha-test-session', version: '2025-06-18' }),
      expect.objectContaining({ sessionId: 'alpha-test-session', version: '2025-06-18' }),
    ])
    await servers.close()
  })

  it('answers a same-id server request without consuming the tool result', async () => {
    const servers = await connectMcpServers([{ name: 'remote', url: `${origin}/reverse` }])
    const result = await servers.call('remote', 'reach', {})
    expect(result.content).toEqual([{ type: 'text', text: 'reached reach' }])

    const call = seen.findLast((request) => request.method === 'tools/call')
    const callId = call === undefined ? undefined : (JSON.parse(call.body) as { id: unknown }).id
    const replied = () =>
      seen.some((request) => {
        const reply = JSON.parse(request.body) as { id?: unknown; error?: { code?: number } }
        return reply.id === callId && reply.error?.code === -32601
      })
    for (let attempt = 0; attempt < 100 && !replied(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    expect(replied()).toBe(true)
    await servers.close()
  })

  it('lists and calls a server that answers with a JSON body', async () => {
    const servers = await connectMcpServers([
      { name: 'remote', url: `${origin}/json`, headers: { authorization: 'Bearer s3cret' } },
    ])
    expect(servers.tools().map((tool) => [tool.server, tool.name])).toEqual([['remote', 'reach']])
    const result = await servers.call('remote', 'reach', {})
    expect(result.content).toEqual([{ type: 'text', text: 'reached reach' }])
    expect(seen.some((request) => request.authorization === 'Bearer s3cret')).toBe(true)
    await servers.close()
  })

  it('reads a server that answers with a stream of events', async () => {
    const servers = await connectMcpServers([{ name: 'streamed', url: `${origin}/stream` }])
    expect(servers.tools().map((tool) => tool.name)).toEqual(['reach'])
    const result = await servers.call('streamed', 'reach', {})
    expect(result.content).toEqual([{ type: 'text', text: 'reached reach' }])
    await servers.close()
  })

  it('leaves out a server that answers with a failure', async () => {
    const servers = await connectMcpServers([{ name: 'broken', url: `${origin}/broken` }])
    expect(servers.tools()).toEqual([])
    await servers.close()
  })
})
