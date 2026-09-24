import {
  type McpExchange,
  type McpSamplingAnswer,
  type McpSamplingPrompt,
  type McpSamplingRequest,
  type RuntimeEvent,
  readMcpSampling,
  type Undef,
  type UsageTotals,
  validMcpSamplingEdits,
} from '@alpha/domain'
import { McpRequestError, type McpServerRequest } from '@alpha/mcp'
import type { McpExchangeLog } from '@alpha/sessions'

export interface SamplingModel {
  providerId: string
  modelId: string
  name: string
  maxTokens: number
  generate: (
    prompt: McpSamplingPrompt,
    signal: AbortSignal,
  ) => Promise<{ text: string; usage: UsageTotals; stopReason: 'stop' | 'length' }>
}

export interface SamplingPorts {
  log: McpExchangeLog
  emit: (event: RuntimeEvent) => void
  refuseUnattended: (conversationId: string) => boolean
  modelFor: (conversationId: string) => Undef<SamplingModel>
}

interface Waiting {
  conversationId: string
  request: McpSamplingRequest
  model: SamplingModel
  controller: AbortController
  resolve: (result: object) => void
  reject: (error: Error) => void
  detach: () => void
}

function promptText(prompt: McpSamplingPrompt): string {
  const messages = prompt.messages.map((message) => message.text)
  if (messages.length === 1 && prompt.systemPrompt === undefined) return messages[0] ?? ''
  return [prompt.systemPrompt, ...prompt.messages.map((message) => `${message.role}: ${message.text}`)]
    .filter((part) => part !== undefined)
    .join('\n\n')
}

function requestRecord(inbound: McpServerRequest, prompt: Undef<McpSamplingPrompt>): McpExchange {
  return {
    id: crypto.randomUUID(),
    server: inbound.server,
    method: 'sampling/createMessage',
    toolCallId: inbound.context.toolCallId,
    toolName: inbound.context.toolName ?? inbound.context.toolCallId,
    requestText: prompt === undefined ? 'Unsupported sampling request' : promptText(prompt),
    requestedAt: Date.now(),
    outcome: 'pending',
  }
}

/** Owns one server's model request through consent, generation and final review. */
export class McpSamplingBroker {
  private readonly ports: SamplingPorts
  private readonly waiting = new Map<string, Waiting>()

  public constructor(ports: SamplingPorts) {
    this.ports = ports
  }

  public async handle(inbound: McpServerRequest): Promise<object> {
    if (inbound.method !== 'sampling/createMessage') throw new McpRequestError(-32601, 'Method not found')
    const prompt = readMcpSampling(inbound.params)
    const conversationId = inbound.context.conversationId
    const record = requestRecord(inbound, prompt)
    this.ports.log.start(conversationId, record)
    if (this.ports.refuseUnattended(conversationId)) {
      this.refuse(conversationId, record.id, -32000, 'Nobody is watching this run')
    }
    if (prompt === undefined) this.refuse(conversationId, record.id, -32602, 'Unsupported sampling request')
    const model = this.ports.modelFor(conversationId)
    if (model === undefined) this.refuse(conversationId, record.id, -32000, 'No configured model is available')
    if (inbound.signal.aborted) this.refuse(conversationId, record.id, -32000, 'Parent tool call stopped')
    const request: McpSamplingRequest = {
      requestId: record.id,
      server: record.server,
      toolCallId: record.toolCallId,
      toolName: record.toolName,
      requestedAt: record.requestedAt,
      prompt: { ...prompt, maxTokens: Math.min(prompt.maxTokens, model.maxTokens) },
      model: { providerId: model.providerId, modelId: model.modelId, name: model.name, maxTokens: model.maxTokens },
      stage: 'consent',
    }
    return new Promise<object>((resolve, reject) => {
      const controller = new AbortController()
      const abort = (): void => this.finish(record.id, 'cancelled')
      inbound.signal.addEventListener('abort', abort, { once: true })
      this.waiting.set(record.id, {
        conversationId,
        request,
        model,
        controller,
        resolve,
        reject,
        detach: () => inbound.signal.removeEventListener('abort', abort),
      })
      this.announce(conversationId, request)
      this.record(conversationId, record)
    })
  }

  public async answer(conversationId: string, requestId: string, answer: McpSamplingAnswer): Promise<void> {
    const entry = this.waiting.get(requestId)
    if (entry === undefined || entry.conversationId !== conversationId)
      throw new Error('MCP request is no longer pending')
    if (answer.action === 'generate') return this.generate(entry, answer)
    if (answer.action === 'share') {
      if (entry.request.stage !== 'review' || entry.request.generated === undefined) {
        throw new Error('There is no generated answer to share')
      }
      const generated = entry.request.generated.text
      this.ports.log.update(conversationId, requestId, { responseText: generated })
      this.finish(requestId, 'accepted', {
        role: 'assistant',
        content: { type: 'text', text: generated },
        model: entry.model.modelId,
        stopReason: entry.request.generated.stopReason === 'length' ? 'maxTokens' : 'endTurn',
      })
      return
    }
    this.finish(requestId, answer.action === 'decline' ? 'declined' : 'cancelled')
  }

  public pending(conversationId: string): McpSamplingRequest[] {
    return [...this.waiting.values()].flatMap((entry) =>
      entry.conversationId === conversationId ? [entry.request] : [],
    )
  }

  private async generate(entry: Waiting, answer: Extract<McpSamplingAnswer, { action: 'generate' }>): Promise<void> {
    const request = entry.request
    if (request.stage !== 'consent') throw new Error('Sampling has already started')
    if (!validMcpSamplingEdits(request.prompt, answer.messages, answer.systemPrompt)) {
      throw new Error('Sampling prompt does not match the requested messages')
    }
    const prompt: McpSamplingPrompt = {
      ...request.prompt,
      messages: request.prompt.messages.map((message, index) => ({ ...message, text: answer.messages[index] ?? '' })),
      ...(answer.systemPrompt === undefined ? { systemPrompt: undefined } : { systemPrompt: answer.systemPrompt }),
    }
    const edited = promptText(prompt)
    this.ports.log.update(entry.conversationId, request.requestId, {
      submittedText: edited,
      model: { providerId: entry.model.providerId, modelId: entry.model.modelId },
    })
    entry.request = { ...request, stage: 'generating', prompt }
    this.announce(entry.conversationId, entry.request)
    try {
      const output = await entry.model.generate(prompt, entry.controller.signal)
      if (!this.waiting.has(request.requestId)) return
      const updated = this.ports.log.update(entry.conversationId, request.requestId, { usage: output.usage })
      if (updated !== undefined) this.record(entry.conversationId, updated)
      if (output.text.trim() === '' || output.text.length > 32_000) throw new Error('Model returned no supported text')
      entry.request = { ...entry.request, stage: 'review', generated: output }
      this.announce(entry.conversationId, entry.request)
    } catch (error) {
      if (!this.waiting.has(request.requestId)) return
      this.finish(request.requestId, 'refused')
      throw error
    }
  }

  private finish(requestId: string, outcome: McpExchange['outcome'], result?: object): void {
    const entry = this.waiting.get(requestId)
    if (entry === undefined) return
    this.waiting.delete(requestId)
    entry.detach()
    entry.controller.abort()
    const record = this.ports.log.finish(entry.conversationId, requestId, outcome, Date.now())
    if (record !== undefined) this.record(entry.conversationId, record)
    if (result !== undefined) entry.resolve(result)
    else entry.reject(new McpRequestError(-32000, `Sampling ${outcome}`))
  }

  private refuse(conversationId: string, requestId: string, code: number, message: string): never {
    const refused = this.ports.log.finish(conversationId, requestId, 'refused', Date.now())
    if (refused !== undefined) this.record(conversationId, refused)
    throw new McpRequestError(code, message)
  }

  private announce(conversationId: string, request: McpSamplingRequest): void {
    this.ports.emit({ conversationId, type: 'mcp_sampling_requested', request })
  }

  private record(conversationId: string, exchange: McpExchange): void {
    this.ports.emit({ conversationId, type: 'mcp_exchange_recorded', exchange })
  }
}
