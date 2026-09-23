/**
 * The HTTP transport against a real server: one that answers with a JSON body, one that answers
 * with a stream of events, and one that fails. The client has to read both kinds of answer — the
 * current protocol answers a request either way — and hand the headers a definition carries to the
 * server, because that is how a hosted MCP server is authenticated.
 */

import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connectMcpServers } from './servers.ts'

/** Every request the server saw, so a test can say what the client actually sent. */
const seen: { method?: string; authorization?: string; body: string }[] = []

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
      const message = JSON.parse(body) as { id?: unknown; method?: string; params?: Record<string, unknown> }
      seen.push({ method: message.method, authorization: request.headers.authorization, body })
      if (request.url === '/broken') {
        response.writeHead(500).end('no')
        return
      }
      // A notification has no id and is answered with nothing, which the protocol says is a 202.
      if (message.id === undefined) {
        response.writeHead(202).end()
        return
      }
      const answer = JSON.stringify(answerFor({ ...message, id: message.id }))
      if (request.url === '/stream') {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(`event: message\ndata: ${answer}\n\n`)
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
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
