import {
  type McpElicitationAnswer,
  type McpElicitationRequest,
  type McpExchange,
  type RuntimeEvent,
  readMcpElicitation,
  validMcpElicitationContent,
} from '@alpha/domain'
import { McpRequestError, type McpServerRequest } from '@alpha/mcp'
import type { McpExchangeLog } from '@alpha/sessions'

interface Waiting {
  conversationId: string
  request: McpElicitationRequest
  resolve: (answer: McpElicitationAnswer) => void
  detach: () => void
}

export interface ElicitationPorts {
  log: McpExchangeLog
  emit: (event: RuntimeEvent) => void
  /** Counts an unattended refusal and answers whether anyone is watching this run. */
  refuseUnattended: (conversationId: string) => boolean
}

function requestRecord(inbound: McpServerRequest, message?: string): McpExchange {
  const params =
    typeof inbound.params === 'object' && inbound.params !== null ? (inbound.params as Record<string, unknown>) : {}
  return {
    id: crypto.randomUUID(),
    server: inbound.server,
    method: 'elicitation/create',
    toolCallId: inbound.context.toolCallId,
    toolName: inbound.context.toolName ?? inbound.context.toolCallId,
    requestText: message ?? (typeof params.message === 'string' ? params.message.slice(0, 4_000) : 'Unsupported form'),
    requestedAt: Date.now(),
    outcome: 'pending',
  }
}

/** Holds a server's form only while its parent tool call is alive. */
export class McpElicitationBroker {
  private readonly ports: ElicitationPorts
  private readonly waiting = new Map<string, Waiting>()

  public constructor(ports: ElicitationPorts) {
    this.ports = ports
  }

  public async handle(inbound: McpServerRequest): Promise<McpElicitationAnswer> {
    if (inbound.method !== 'elicitation/create') throw new McpRequestError(-32601, 'Method not found')
    const form = readMcpElicitation(inbound.params)
    const conversationId = inbound.context.conversationId
    const record = requestRecord(inbound, form?.message)
    this.ports.log.start(conversationId, record)
    if (this.ports.refuseUnattended(conversationId)) {
      this.refuse(conversationId, record.id, -32000, 'Nobody is watching this run')
    }
    if (form === undefined) this.refuse(conversationId, record.id, -32602, 'Unsupported elicitation schema')
    const request: McpElicitationRequest = {
      requestId: record.id,
      server: record.server,
      toolCallId: record.toolCallId,
      toolName: record.toolName,
      requestedAt: record.requestedAt,
      form,
    }
    if (inbound.signal.aborted) {
      const cancelled = this.ports.log.finish(conversationId, request.requestId, 'cancelled', Date.now())
      if (cancelled !== undefined) this.record(conversationId, cancelled)
      return Promise.resolve({ action: 'cancel' })
    }
    return new Promise<McpElicitationAnswer>((resolve) => {
      const abort = (): void => this.finish(request.requestId, { action: 'cancel' })
      inbound.signal.addEventListener('abort', abort, { once: true })
      this.waiting.set(request.requestId, {
        conversationId,
        request,
        resolve,
        detach: () => inbound.signal.removeEventListener('abort', abort),
      })
      this.ports.emit({ conversationId, type: 'mcp_elicitation_requested', request })
      this.record(conversationId, record)
    })
  }

  public answer(conversationId: string, requestId: string, answer: McpElicitationAnswer): void {
    const entry = this.waiting.get(requestId)
    if (entry === undefined || entry.conversationId !== conversationId)
      throw new Error('MCP request is no longer pending')
    if (answer.action === 'accept' && !validMcpElicitationContent(entry.request.form, answer.content)) {
      throw new Error('MCP form content does not match the requested fields')
    }
    this.finish(requestId, answer)
  }

  public pending(conversationId: string): McpElicitationRequest[] {
    return [...this.waiting.values()].flatMap((entry) =>
      entry.conversationId === conversationId ? [entry.request] : [],
    )
  }

  private finish(requestId: string, answer: McpElicitationAnswer): void {
    const entry = this.waiting.get(requestId)
    if (entry === undefined) return
    this.waiting.delete(requestId)
    entry.detach()
    const outcome = answer.action === 'accept' ? 'accepted' : answer.action === 'decline' ? 'declined' : 'cancelled'
    const content = answer.action === 'accept' ? answer.content : undefined
    const record = this.ports.log.finish(entry.conversationId, requestId, outcome, Date.now(), content)
    if (record !== undefined) this.record(entry.conversationId, record)
    entry.resolve(answer)
  }

  private record(conversationId: string, exchange: McpExchange): void {
    this.ports.emit({ conversationId, type: 'mcp_exchange_recorded', exchange })
  }

  private refuse(conversationId: string, requestId: string, code: number, message: string): never {
    const refused = this.ports.log.finish(conversationId, requestId, 'refused', Date.now())
    if (refused !== undefined) this.record(conversationId, refused)
    throw new McpRequestError(code, message)
  }
}
