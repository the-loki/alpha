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

/** What a transport carries: one message out, and whatever comes back through the handlers. */
export interface McpFrame {
  /** Carries one message. Rejects when the transport could not carry it. */
  send(text: string): Promise<void>
  close(): void
}

/** How a frame reports what it carried, and that it can carry no more. */
export interface FrameHandlers {
  message: (text: string) => void
  closed: (why: string) => void
}

export interface McpSession {
  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown>
  notify(method: string, params: unknown): void
  close(): void
}

interface Waiting {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  /** Gives up on the answer: the caller stopped, or the transport failed to carry the request. */
  stop: (why: string) => void
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
  rejectRequest: (id: string | number) => void,
  notifications?: Notify,
): FrameHandlers {
  return {
    message: (text) => {
      const answer = answerOf(text)
      if (answer === undefined) return
      // Requests and notifications carry a method; neither can answer our outbound request, even
      // when the server reused the same id in its own direction.
      if (typeof answer.method === 'string') {
        if (answer.id === undefined) notifications?.(answer.method, answer.params)
        else if (typeof answer.id === 'string' || typeof answer.id === 'number') rejectRequest(answer.id)
        return
      }
      deliver(answer, waiting)
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
function deliver(answer: Answer, waiting: Map<number, Waiting>): void {
  const id = typeof answer.id === 'number' ? answer.id : undefined
  if (id === undefined) return
  const entry = waiting.get(id)
  if (entry === undefined) return
  waiting.delete(id)
  const message = answer.error?.message
  if (answer.error === undefined) entry.resolve(answer.result)
  else entry.reject(new Error(typeof message === 'string' ? message : 'the server answered with an error'))
}

/** What a stop does: the caller's answer is given up on, and the server is told to stop working. */
function stopOf(waiting: Map<number, Waiting>, notify: Notify, id: number, method: string): () => void {
  return () => {
    const entry = waiting.get(id)
    if (entry === undefined) return
    entry.stop(`stopped before the MCP server answered ${method}`)
    notify('notifications/cancelled', { requestId: id, reason: 'the caller stopped waiting' })
  }
}

function rejectUnknownRequest(frame: McpFrame, id: string | number): void {
  const reply = { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }
  void frame.send(JSON.stringify(reply)).catch(() => {
    // No caller waits for this answer; the server may already have gone away.
  })
}

export function createSession(
  open: (handlers: FrameHandlers) => McpFrame,
  notifications?: (method: string, params: unknown) => void,
): McpSession {
  const waiting = new Map<number, Waiting>()
  let nextId = 1
  let closed: Undef<string>

  const end = (why: string): void => {
    if (closed !== undefined) return
    closed = why
    for (const [id, entry] of waiting) {
      waiting.delete(id)
      entry.reject(new Error(why))
    }
  }

  let frame: McpFrame
  frame = open(handlersOf(waiting, end, (id) => rejectUnknownRequest(frame, id), notifications))

  const notify: Notify = (method, params) => {
    void frame.send(JSON.stringify({ jsonrpc: '2.0', method, params })).catch(() => {
      // A notification has no answer, so a transport that could not carry it has nobody to tell.
    })
  }

  return {
    request: async (method, params, signal) => {
      if (closed !== undefined) throw new Error(closed)
      const id = nextId
      nextId += 1
      const answered = new Promise<unknown>((resolve, reject) => {
        waiting.set(id, {
          resolve,
          reject,
          stop: (why) => {
            waiting.delete(id)
            reject(new Error(why))
          },
        })
      })
      const stop = stopOf(waiting, notify, id, method)
      if (signal?.aborted === true) stop()
      else signal?.addEventListener('abort', stop, { once: true })
      try {
        await frame.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      } catch (error) {
        waiting.get(id)?.stop(error instanceof Error ? error.message : String(error))
      }
      return answered
    },
    notify,
    close: () => {
      end('the workbench closed this MCP connection')
      frame.close()
    },
  }
}
