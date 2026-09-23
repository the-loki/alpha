/**
 * Alpha's MCP client: the protocol and the two transports a server can be reached over, and the one
 * place the servers of a run are held. It speaks MCP rather than pi — the face that turns these
 * tools into the agent's own lives in `@alpha/internal-plugins`, where naming the agent library is
 * allowed (C2.0) — so this is an ordinary library with no agent in it at all.
 */

export * from './client.ts'
export * from './servers.ts'
