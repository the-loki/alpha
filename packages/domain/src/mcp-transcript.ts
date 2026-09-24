import type { McpElicitationRequest, McpExchange, McpSamplingRequest } from './mcp-requests.ts'
import type { RuntimeEvent } from './runtime-events.ts'

interface McpProjection {
  mcpPending: McpElicitationRequest[]
  mcpSamplingPending: McpSamplingRequest[]
  mcpExchanges: McpExchange[]
}

/** Applies a server request or its settled audit record to the open conversation. */
export function reduceMcpEvent<T extends McpProjection>(
  state: T,
  event: Extract<
    RuntimeEvent,
    { type: 'mcp_elicitation_requested' | 'mcp_sampling_requested' | 'mcp_exchange_recorded' }
  >,
): T {
  if (event.type === 'mcp_elicitation_requested') {
    return { ...state, mcpPending: [...state.mcpPending, event.request] }
  }
  if (event.type === 'mcp_sampling_requested') {
    const previous = state.mcpSamplingPending.filter((request) => request.requestId !== event.request.requestId)
    return { ...state, mcpSamplingPending: [...previous, event.request] }
  }
  return {
    ...state,
    mcpExchanges: [event.exchange, ...state.mcpExchanges.filter((record) => record.id !== event.exchange.id)].slice(
      0,
      200,
    ),
    mcpPending:
      event.exchange.outcome === 'pending'
        ? state.mcpPending
        : state.mcpPending.filter((request) => request.requestId !== event.exchange.id),
    mcpSamplingPending:
      event.exchange.outcome === 'pending'
        ? state.mcpSamplingPending
        : state.mcpSamplingPending.filter((request) => request.requestId !== event.exchange.id),
  }
}
