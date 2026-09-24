import type { McpElicitation, McpElicitationContent } from './mcp-elicitation.ts'

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
