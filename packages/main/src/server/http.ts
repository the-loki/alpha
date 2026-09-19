/**
 * The server a browser talks to. It serves the renderer bundle and answers the same channel table
 * the Electron window is registered from, so a browser client is a client of this workbench rather
 * than a second, weaker API: the gate, the levels and the events are all the same ones.
 *
 * Two things are deliberately absent. There is no route that reads the token from a query string
 * (the browser trades it for a cookie once, and the token never reaches a URL), and there is no
 * route outside `/api/` that touches anything but the bundle's own files.
 */

import { readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { IPC } from '@alpha/core'
import type { Broadcast } from '../broadcast.ts'
import { CHANNELS, type ChannelHandler, type ChannelPorts } from '../channels.ts'
import { SessionGate } from './session.ts'

/** Where the server listens: this machine only, or every interface it has. */
export type Bind = 'local' | 'network'

export interface ServerOptions {
  ports: ChannelPorts
  broadcast: Broadcast
  /** The renderer's build output: the only directory files are ever read from. */
  bundleDirectory: string
  token: string
  port: number
  bind: Bind
}

export interface RunningServer {
  port: number
  /** What a person types into a browser on this machine. */
  url: string
  token: string
  close(): Promise<void>
}

const BIND_ADDRESS: Record<Bind, string> = { local: '127.0.0.1', network: '0.0.0.0' }
const BODY_LIMIT = 1024 * 1024
/** A failed unlock waits this long before saying so, which makes guessing pointless. */
const REFUSAL_DELAY_MS = 200

/**
 * The table by channel string, which is what a client sends. The table is keyed by contract name
 * so the compiler can see it is total; the wire speaks the channel, so this is the crossing.
 */
const BY_CHANNEL: Map<string, ChannelHandler> = new Map(
  Object.entries(CHANNELS).map(([name, handler]) => [IPC[name as keyof typeof IPC], handler as ChannelHandler]),
)

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const gate = new SessionGate(options.token)
  const server = createServer((request, response) => {
    handle(options, gate, request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    })
  })

  await new Promise<void>((settle, fail) => {
    server.once('error', fail)
    server.listen(options.port, BIND_ADDRESS[options.bind], () => {
      server.removeListener('error', fail)
      settle()
    })
  })

  const port = portOf(server)
  return {
    port,
    url: `http://${BIND_ADDRESS.local}:${port}`,
    token: gate.token,
    close: () => closeServer(server),
  }
}

async function handle(
  options: ServerOptions,
  gate: SessionGate,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  // The path only: nothing here reads a query string, and a token would not be in one if it did.
  const pathname = (request.url ?? '/').split('?')[0]

  if (pathname === '/api/session') {
    await answerSession(gate, request, response)
    return
  }

  if (pathname.startsWith('/api/')) {
    if (!gate.allows({ cookie: request.headers.cookie, authorization: request.headers.authorization })) {
      await delay(REFUSAL_DELAY_MS)
      sendJson(response, 401, { error: 'a session is required' })
      return
    }
    if (pathname === '/api/events') {
      streamEvents(options, request, response)
      return
    }
    if (pathname === '/api/invoke') {
      await answerInvoke(options, request, response)
      return
    }
    sendJson(response, 404, { error: 'no such route' })
    return
  }

  sendFile(options.bundleDirectory, pathname, response)
}

async function answerSession(gate: SessionGate, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson(request)
  const record = typeof body === 'object' && body !== null ? (body as { token?: unknown }) : {}
  const cookie = gate.exchange(record.token)
  if (cookie === undefined) {
    await delay(REFUSAL_DELAY_MS)
    sendJson(response, 401, { error: 'that token is not the one' })
    return
  }
  response.setHeader('set-cookie', cookie)
  sendJson(response, 200, { ok: true })
}

/** One channel, dispatched through the table both transports share. */
async function answerInvoke(options: ServerOptions, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson(request)
  const record = typeof body === 'object' && body !== null ? (body as { channel?: unknown; args?: unknown }) : {}
  const name = typeof record.channel === 'string' ? record.channel : ''
  const handler = BY_CHANNEL.get(name)
  if (handler === undefined) {
    sendJson(response, 400, { error: `no channel named ${name}` })
    return
  }
  const args = Array.isArray(record.args) ? record.args : []

  try {
    const value = await handler(options.ports, args)
    sendJson(response, 200, { value })
  } catch (failure) {
    sendJson(response, 400, { error: failure instanceof Error ? failure.message : String(failure) })
  }
}

/** What main pushes, as server-sent events: one channel per frame, and a comment to keep it open. */
function streamEvents(options: ServerOptions, request: IncomingMessage, response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  })
  response.write(': connected\n\n')

  const leave = options.broadcast.subscribe((push) => {
    response.write(`event: ${push.channel}\ndata: ${JSON.stringify(push.payload)}\n\n`)
  })
  const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 20_000)

  request.on('close', () => {
    clearInterval(keepAlive)
    leave()
  })
}

/** The bundle, and only the bundle: a path that resolves outside it is refused, not resolved. */
function sendFile(bundleDirectory: string, pathname: string, response: ServerResponse): void {
  const root = resolve(bundleDirectory)
  const wanted = resolve(join(root, decodeURIComponent(pathname)))
  const inside = wanted === root || wanted.startsWith(root + sep)
  // A path that resolves outside the bundle is refused, not answered with the app shell: the
  // fallback below is for a route the app renders, not for a request that walked out of the tree.
  if (!inside) {
    sendJson(response, 404, { error: 'not found' })
    return
  }
  const file = isFile(wanted) ? wanted : join(root, 'index.html')

  if (!isFile(file)) {
    sendJson(response, 404, { error: 'not found' })
    return
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  response.end(readFileSync(file))
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > BODY_LIMIT) throw new Error('the body is too large')
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
  } catch {
    return undefined
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
}

function portOf(server: Server): number {
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

function closeServer(server: Server): Promise<void> {
  return new Promise((settle) => {
    server.close(() => settle())
    server.closeAllConnections()
  })
}

const delay = (ms: number) => new Promise((settle) => setTimeout(settle, ms))
