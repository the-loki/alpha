/** Server-origin requests are separate from client-origin requests even when their JSON-RPC IDs match. */

import type { Undef } from '@alpha/domain'

interface ReplyFrame {
  send(text: string): Promise<void>
}

export interface McpCallContext {
  conversationId: string
  toolCallId: string
  toolName?: string
}

export interface McpServerRequest {
  server: string
  method: 'sampling/createMessage' | 'elicitation/create'
  params: unknown
  context: McpCallContext
  signal: AbortSignal
}

export type McpRequestHandler = (request: McpServerRequest) => Promise<unknown>

export class McpRequestError extends Error {
  public constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

export interface ActiveCall {
  id: number
  context: McpCallContext
  signal?: AbortSignal
}

interface PendingRequest {
  parentId: number
  controller: AbortController
  detach: () => void
}

export interface InboundRequests {
  receive(id: string | number, method: string, params: unknown, originId?: number): void
  cancel(params: unknown): void
  cancelParent(id: number): void
  close(): void
}

type Reply = { result: unknown } | { error: { code: number; message: string } }

function sendReply(frame: ReplyFrame, id: string | number, reply: Reply): void {
  void frame.send(JSON.stringify({ jsonrpc: '2.0', id, ...reply })).catch(() => {
    // The server may have disconnected while an answer was being prepared.
  })
}

function requestIdOf(params: unknown): Undef<string | number> {
  if (typeof params !== 'object' || params === null) return undefined
  const id = (params as { requestId?: unknown }).requestId
  return typeof id === 'string' || typeof id === 'number' ? id : undefined
}

function receiveRequest(
  frame: ReplyFrame,
  server: string,
  active: (originId?: number) => ActiveCall[],
  handle: Undef<McpRequestHandler>,
  pending: Map<string | number, PendingRequest>,
  abandon: (id: string | number) => void,
  finish: (id: string | number, reply: Reply) => void,
  id: string | number,
  method: string,
  params: unknown,
  originId?: number,
): void {
  if (method !== 'sampling/createMessage' && method !== 'elicitation/create') {
    sendReply(frame, id, { error: { code: -32601, message: 'Method not found' } })
    return
  }
  if (handle === undefined) {
    sendReply(frame, id, { error: { code: -32601, message: 'Method not found' } })
    return
  }
  const parents = active(originId)
  if (parents.length !== 1) {
    sendReply(frame, id, { error: { code: -32000, message: 'Cannot attribute request to one tool call' } })
    return
  }
  if (pending.has(id)) {
    sendReply(frame, id, { error: { code: -32600, message: 'Request ID is already pending' } })
    return
  }
  const parent = parents[0]
  if (parent === undefined || parent.signal?.aborted === true) return
  const controller = new AbortController()
  const abort = (): void => abandon(id)
  parent.signal?.addEventListener('abort', abort, { once: true })
  pending.set(id, {
    parentId: parent.id,
    controller,
    detach: () => parent.signal?.removeEventListener('abort', abort),
  })
  void Promise.resolve()
    .then(() =>
      controller.signal.aborted
        ? undefined
        : handle({ server, method, params, context: parent.context, signal: controller.signal }),
    )
    .then(
      (result) => finish(id, { result }),
      (error: unknown) => {
        const known = error instanceof McpRequestError ? error : undefined
        finish(id, { error: { code: known?.code ?? -32603, message: known?.message ?? 'Request failed' } })
      },
    )
}

/** Correlates a server request to one live tool call and owns its answer until that call ends. */
export function inboundRequests(
  frame: ReplyFrame,
  server: string,
  active: (originId?: number) => ActiveCall[],
  handle?: McpRequestHandler,
): InboundRequests {
  const pending = new Map<string | number, PendingRequest>()

  const abandon = (id: string | number): void => {
    const entry = pending.get(id)
    if (entry === undefined) return
    pending.delete(id)
    entry.detach()
    entry.controller.abort()
  }

  const finish = (id: string | number, reply: Reply): void => {
    const entry = pending.get(id)
    if (entry === undefined || entry.controller.signal.aborted) return
    pending.delete(id)
    entry.detach()
    sendReply(frame, id, reply)
  }

  return {
    receive: (id, method, params, originId) =>
      receiveRequest(frame, server, active, handle, pending, abandon, finish, id, method, params, originId),
    cancel: (params) => {
      const id = requestIdOf(params)
      if (id !== undefined) abandon(id)
    },
    cancelParent: (id) => {
      for (const [requestId, entry] of pending) if (entry.parentId === id) abandon(requestId)
    },
    close: () => {
      for (const id of pending.keys()) abandon(id)
    },
  }
}
