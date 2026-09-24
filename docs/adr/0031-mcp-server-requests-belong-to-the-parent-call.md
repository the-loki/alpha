# MCP server requests belong to the parent tool call

## Context

Alpha holds one MCP connection per server for the whole workbench. Two conversations can therefore
call the same server at once. A server may send a request while answering a tool call, with an ID
equal to one of Alpha's own request IDs. Sampling would spend the conversation's model budget and
elicitation would ask its user a question. Neither may be routed by guessing which conversation is
current in the window.

## Decision

The MCP plugin gives every tool call its conversation ID and tool-call ID. A dedicated inbound port
in `@alpha/mcp` carries a server request with that identity and an abort signal; there is no general
`AlphaPlugin.onServerRequest` hook. An HTTP request in the SSE response to a POST belongs to that
POST's tool call. A stdio request belongs only when the server has exactly one active tool call.
Requests during startup, list operations, or concurrent stdio calls are refused.

Client-origin and server-origin JSON-RPC IDs have separate pending tables. A server's
`notifications/cancelled` affects only its own pending request, even if the numeric ID matches a
client call. Stopping the parent call, losing the connection, or receiving a server cancellation
aborts the inbound request without sending a late answer. An HTTP answer to a server request is a
new POST carrying the protocol version and any session ID assigned at initialization.

The initialized client declares `elicitation` after the attended form, refusal, and audit path is
complete (#216). It still does not declare `sampling`; that capability needs its own consent,
review, refusal, audit, and usage path (#217). An unsupported request receives `Method not found`.

## Consequences

- A shared server cannot turn an ambiguous request into another conversation's prompt or spend.
- Sampling consent and elicitation forms stay distinct from the tool permission gate; they are
  requests *from* a server, not agent tool calls.
- A stdio server doing concurrent tool work may have its inbound request refused because stdio
  carries no parent request ID. It can retry when only one tool call is active.
