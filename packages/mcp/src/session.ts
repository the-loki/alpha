/**
 * The JSON-RPC half of a connection: requests correlated to their answers by an id, over a frame
 * that carries messages. What a frame *is* is the transport's business — a child process's standard
 * input and output, or one HTTP endpoint — so this is where the two transports meet, and the only
 * place the request bookkeeping lives.
 *
 * What a server says without being asked — a notification, which has a method and no id — is handed
 * to the caller's own handler: whether a tool list that changed matters is not this file's business.
 *
 * A request the caller stops becomes a rejection here and a `notifications/cancelled` on the wire,
 * which is what the protocol asks of a client that no longer wants the answer: the server should
 * stop working rather than finish something nobody will read. When the frame ends — the child
 * exited, the endpoint stopped answering — every request still waiting is rejected with why, so a
 * server that has gone away cannot leave a turn hanging on it.
 */

import type { Undef } from '@alpha/domain'
import {
  type ActiveCall,
  type InboundRequests,
  inboundRequests,
  type McpCallContext,
  type McpRequestHandler,
} from './inbound.ts'

/** What a transport carries: one message out, and whatever comes back through the handlers. */
export interface McpFrame {
  /** Carries one message. Rejects when the transport could not carry it. */
  send(text: string, originatingRequestId?: number, signal?: AbortSignal): Promise<void>
  close(): void
}

/** How a frame reports what it carried, and that it can carry no more. */
export interface FrameHandlers {
  message: (text: string, originatingRequestId?: number) => void
  closed: (why: string) => void
}

export interface McpSession {
  request(method: string, params: unknown, signal?: AbortSignal, context?: McpCallContext): Promise<unknown>
  notify(method: string, params: unknown): Promise<void>
  close(): void
}

interface Waiting {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  /** Gives up on the answer: the caller stopped, or the transport failed to carry the request. */
  stop: (why: string) => void
  context?: McpCallContext
  signal?: AbortSignal
}

/** One message from the server: an answer, or something it says with nobody waiting for it. */
interface Answer {
  id?: unknown
  method?: unknown
  params?: unknown
  result?: unknown
  error?: { message?: unknown }
}

type Notify = (method: string, params: unknown) => void

/** How a frame's messages are read: an answer to whoever waits, or an inbound request/notification. */
function handlersOf(
  waiting: Map<number, Waiting>,
  end: (why: string) => void,
  receive: (id: string | number, method: string, params: unknown, originId?: number) => void,
  cancel: (params: unknown) => void,
  settled: (id: number) => void,
  notifications?: Notify,
): FrameHandlers {
  return {
    message: (text, originId) => {
      const answer = answerOf(text)
      if (answer === undefined) return
      // Requests and notifications carry a method; neither can answer our outbound request, even
      // when the server reused the same id in its own direction.
      if (typeof answer.method === 'string') {
        if (answer.id === undefined) {
          if (answer.method === 'notifications/cancelled') cancel(answer.params)
          else notifications?.(answer.method, answer.params)
        } else if (typeof answer.id === 'string' || typeof answer.id === 'number') {
          receive(answer.id, answer.method, answer.params, originId)
        }
        return
      }
      deliver(answer, waiting, settled)
    },
    closed: end,
  }
}

function answerOf(text: string): Undef<Answer> {
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Answer) : undefined
  } catch {
    // A line that is not JSON is not a message; the protocol gives no way to answer one.
    return undefined
  }
}

/** One answer delivered to whoever is waiting for it; an id nobody waits for is nobody's answer. */
function deliver(answer: Answer, waiting: Map<number, Waiting>, settled: (id: number) => void): void {
  const id = typeof answer.id === 'number' ? answer.id : undefined
  if (id === undefined) return
  const entry = waiting.get(id)
  if (entry === undefined) return
  waiting.delete(id)
  settled(id)
  const message = answer.error?.message
  if (answer.error === undefined) entry.resolve(answer.result)
  else entry.reject(new Error(typeof message === 'string' ? message : 'the server answered with an error'))
}

/** What a stop does: the caller's answer is given up on, and the server is told to stop working. */
function stopOf(
  waiting: Map<number, Waiting>,
  notify: Notify,
  settled: (id: number) => void,
  id: number,
  method: string,
): () => void {
  return () => {
    const entry = waiting.get(id)
    if (entry === undefined) return
    entry.stop(`stopped before the MCP server answered ${method}`)
    settled(id)
    notify('notifications/cancelled', { requestId: id, reason: 'the caller stopped waiting' })
  }
}

function activeCalls(waiting: Map<number, Waiting>, originId?: number): ActiveCall[] {
  const entries = originId === undefined ? [...waiting] : [[originId, waiting.get(originId)] as const]
  return entries.flatMap(([id, entry]) =>
    entry?.context === undefined ? [] : [{ id, context: entry.context, signal: entry.signal }],
  )
}

async function ask(
  frame: McpFrame,
  waiting: Map<number, Waiting>,
  inbound: InboundRequests,
  notify: Notify,
  id: number,
  method: string,
  params: unknown,
  signal?: AbortSignal,
  context?: McpCallContext,
): Promise<unknown> {
  const answered = new Promise<unknown>((resolve, reject) => {
    waiting.set(id, {
      resolve,
      reject,
      stop: (why) => {
        waiting.delete(id)
        reject(new Error(why))
      },
      context,
      signal,
    })
  })
  const stop = stopOf(waiting, notify, (parentId) => inbound.cancelParent(parentId), id, method)
  if (signal?.aborted === true) stop()
  else signal?.addEventListener('abort', stop, { once: true })
  void frame.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }), id, signal).catch((error: unknown) => {
    const entry = waiting.get(id)
    if (entry === undefined) return
    entry.stop(error instanceof Error ? error.message : String(error))
    inbound.cancelParent(id)
  })
  try {
    return await answered
  } finally {
    signal?.removeEventListener('abort', stop)
  }
}

export function createSession(
  open: (handlers: FrameHandlers) => McpFrame,
  notifications?: (method: string, params: unknown) => void,
  requests?: { server: string; handle?: McpRequestHandler },
): McpSession {
  const waiting = new Map<number, Waiting>()
  let nextId = 1
  let closed: Undef<string>
  let inbound: Undef<InboundRequests>

  const end = (why: string): void => {
    if (closed !== undefined) return
    closed = why
    inbound?.close()
    for (const [id, entry] of waiting) {
      waiting.delete(id)
      entry.reject(new Error(why))
    }
  }

  let frame: McpFrame
  frame = open(
    handlersOf(
      waiting,
      end,
      (id, method, params, originId) => {
        if (closed === undefined) inbound?.receive(id, method, params, originId)
      },
      (params) => inbound?.cancel(params),
      (id) => inbound?.cancelParent(id),
      notifications,
    ),
  )
  inbound = inboundRequests(
    frame,
    requests?.server ?? '',
    (originId) => activeCalls(waiting, originId),
    requests?.handle,
  )

  const notify: Notify = (method, params) => {
    void frame.send(JSON.stringify({ jsonrpc: '2.0', method, params })).catch(() => {
      // A notification has no answer, so a transport that could not carry it has nobody to tell.
    })
  }

  return {
    request: async (method, params, signal, context) => {
      if (closed !== undefined) throw new Error(closed)
      const id = nextId
      nextId += 1
      return await ask(frame, waiting, inbound, notify, id, method, params, signal, context)
    },
    notify: (method, params) => frame.send(JSON.stringify({ jsonrpc: '2.0', method, params })),
    close: () => {
      end('the workbench closed this MCP connection')
      frame.close()
    },
  }
}
