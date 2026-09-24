import type { McpElicitation, McpElicitationContent } from './mcp-elicitation.ts'
import type { McpSamplingPrompt } from './mcp-sampling.ts'
import type { UsageTotals } from './usage.ts'

export type McpExchangeOutcome = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'refused' | 'interrupted'

/** A server request and the decision made about it, stored beside one conversation. */
export interface McpExchange {
  id: string
  server: string
  method: 'sampling/createMessage' | 'elicitation/create'
  toolCallId: string
  toolName: string
  requestText: string
  requestedAt: number
  outcome: McpExchangeOutcome
  settledAt?: number
  content?: McpElicitationContent
  submittedText?: string
  responseText?: string
  model?: { providerId: string; modelId: string }
  usage?: UsageTotals
}

/** The live question a server asks; unlike the audit record it still needs an answer. */
export interface McpElicitationRequest {
  requestId: string
  server: string
  toolCallId: string
  toolName: string
  requestedAt: number
  form: McpElicitation
}

export type McpElicitationAnswer =
  | { action: 'accept'; content: McpElicitationContent }
  | { action: 'decline' | 'cancel' }

export interface McpSamplingRequest {
  requestId: string
  server: string
  toolCallId: string
  toolName: string
  requestedAt: number
  prompt: McpSamplingPrompt
  model: { providerId: string; modelId: string; name: string; maxTokens: number }
  stage: 'consent' | 'generating' | 'review'
  generated?: { text: string; usage: UsageTotals; stopReason: 'stop' | 'length' }
}

export type McpSamplingAnswer =
  | { action: 'generate'; messages: string[]; systemPrompt?: string }
  | { action: 'share' | 'decline' | 'cancel' }
