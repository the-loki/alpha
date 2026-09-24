import type { ChatMessage, McpElicitationAnswer, McpElicitationRequest, McpExchange, RuntimeEvent } from '@alpha/domain'
import { McpRequestError, type McpServerRequest } from '@alpha/mcp'
import { McpExchangeLog } from '@alpha/sessions'
import { McpElicitationBroker } from '../mcp/elicitation.ts'

/** Main's owner for inbound MCP requests and their per-conversation audit. */
export class RuntimeMcp {
  private readonly log: McpExchangeLog
  private readonly elicitation: McpElicitationBroker
  private readonly canRoute: (id: string) => boolean

  public constructor(options: {
    dataDirectory: string
    emit: (event: RuntimeEvent) => void
    refuseUnattended: (id: string) => boolean
    canRoute: (id: string) => boolean
  }) {
    this.log = new McpExchangeLog(options.dataDirectory)
    this.elicitation = new McpElicitationBroker({
      log: this.log,
      emit: options.emit,
      refuseUnattended: options.refuseUnattended,
    })
    this.canRoute = options.canRoute
  }

  public handle(request: McpServerRequest): Promise<unknown> {
    if (!this.canRoute(request.context.conversationId)) {
      return Promise.reject(new McpRequestError(-32000, 'The parent conversation is not open'))
    }
    return this.elicitation.handle(request)
  }

  public answer(id: string, requestId: string, answer: McpElicitationAnswer): void {
    this.elicitation.answer(id, requestId, answer)
  }

  public records(id: string): McpExchange[] {
    return this.elicitation.records(id)
  }

  public pending(id: string): McpElicitationRequest[] {
    return this.elicitation.pending(id)
  }

  public fork(source: string, target: string, messages: ChatMessage[]): void {
    const callIds = new Set(
      messages.flatMap((message) => message.blocks.flatMap((block) => (block.kind === 'tool' ? [block.callId] : []))),
    )
    this.log.fork(source, target, callIds)
  }

  public forget(id: string): void {
    this.log.forget(id)
  }
}
