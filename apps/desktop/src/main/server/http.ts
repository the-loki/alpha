/**
 * The server a browser talks to. It serves the renderer bundle and answers the same channel table
 * the Electron window is registered from, so a browser client is a client of this workbench rather
 * than a second, weaker API: the gate, the levels and the events are all the same ones.
 *
 * Two things are deliberately absent. There is no route that reads the token from a query string
 * (the browser trades it for a cookie once, and the token never reaches a URL), and there is no
 * route outside `/api/` that touches anything but the bundle's own files.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { IPC } from '@alpha/contract'
import type { NetworkBind } from '@alpha/domain'
import type { Broadcast } from '../broadcast.ts'
import { CHANNELS, type ChannelHandler, type ChannelPorts } from '../channels.ts'
import { SessionGate } from './session.ts'

export interface ServerOptions {
  ports: ChannelPorts
  broadcast: Broadcast
  /** The renderer's build output: the only directory files are ever read from. */
  bundleDirectory: string
  token: string
  port: number
  bind: NetworkBind
}

export interface RunningServer {
  port: number
  /** What a person types into a browser on this machine. */
  url: string
  token: string
  close(): Promise<void>
}

/**
 * The address each choice means, in one table: where the server listens, and — for the loopback
 * one — the address the settings page offers, which is what keeps the two from drifting apart.
 */
export const BIND_ADDRESS: Record<NetworkBind, string> = { local: '127.0.0.1', network: '0.0.0.0' }
/**
 * How large a request body may be. It is generous because a message's pictures travel inside it,
 * base64 and then JSON-escaped — four thirds and a little on top of the file itself — and the
 * files' own ceiling is enforced per picture where the attachments are read (channels.ts).
 */
const BODY_LIMIT = 16 * 1024 * 1024
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

  if (pathname === '/api/session' || pathname === '/api/invoke') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'POST is required' })
      return
    }
    if (request.headers.origin !== undefined && request.headers.origin !== `http://${request.headers.host}`) {
      sendJson(response, 403, { error: 'the request origin is not this workbench' })
      return
    }
    if (request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      sendJson(response, 415, { error: 'JSON is required' })
      return
    }
  }

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
  // Resolved once, links and all: the bundle may itself be reached through one, and every file
  // read below has to be compared against where that actually is rather than where it is named.
  const root = realPath(resolve(bundleDirectory))
  const wanted = resolve(join(root, decodeURIComponent(pathname)))
  // A path that resolves outside the bundle is refused, not answered with the bundle's index: the
  // fallback below is for a route the window renders, not for a request that walked out of the tree.
  if (!inside(root, wanted)) {
    sendJson(response, 404, { error: 'not found' })
    return
  }
  // Inside on paper is not inside: a symlink is followed by the filesystem and not by that check,
  // so the file that will really be read — the request's own, or the shell it falls back to — is
  // resolved too, and a name that leaves the bundle that way is refused like any other.
  const file = realPath(isFile(wanted) ? wanted : join(root, 'index.html'))

  if (!inside(root, file)) {
    sendJson(response, 404, { error: 'not found' })
    return
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  response.end(readFileSync(file))
}

/** Nothing is served through a root that is not there, so an empty one is never inside anything. */
function inside(root: string, path: string): boolean {
  return root !== '' && (path === root || path.startsWith(root + sep))
}

/** Where a path really is, with every link followed; empty when it is not there at all. */
function realPath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return ''
  }
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
