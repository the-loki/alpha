/**
 * Opening a conversation's runtime: the agent, the gate, and the ledger, wired to one conversation.
 *
 * There is no model to check before opening any more. Whether a model is configured is the agent's
 * business now, and a conversation whose model is missing says so when it is asked to run rather
 * than refusing to open — which is what keeps what was said readable through any of it.
 */

import type { ConversationModel, ConversationSummary, RuntimeEvent, Undef } from '@alpha/core'
import { agentProcessFor } from './agent-process.ts'
import { ConversationRuntime, type PermissionPorts } from './conversation-runtime.ts'
import type { DecisionLog } from './decisions.ts'
import type { AgentPorts } from './session-files.ts'

export interface OpeningPorts {
  agent: AgentPorts
  decisions: DecisionLog
  permissions: () => PermissionPorts
  /** Where the new runtime sends everything it has to say. */
  emit: (event: RuntimeEvent) => void
}

export interface OpeningRequest {
  conversationId: string
  conversation: ConversationSummary
  /** The model it runs on, when the provider it names is one Alpha still has. */
  model: Undef<ConversationModel>
}

/** The runtime for a conversation, or nothing when there is no agent to run. */
export function tryOpen(ports: OpeningPorts, request: OpeningRequest): Undef<ConversationRuntime> {
  const command = agentProcessFor({
    agentPath: ports.agent.path(),
    agentDirectory: ports.agent.directory,
    env: ports.agent.env,
    workspacePath: request.conversation.workspacePath,
    sessionsRoot: ports.agent.sessionsRoot,
    conversationId: request.conversationId,
    sessionId: request.conversation.sessionId,
    name: request.conversation.title,
    model: request.model,
    credential: ports.agent.credential(request.model?.providerId ?? '').env,
  })
  if (command === undefined) return undefined

  const { runtime } = ConversationRuntime.open({
    conversationId: request.conversationId,
    process: command,
    permissions: ports.permissions(),
    decisions: ports.decisions.opened(request.conversationId),
    emit: ports.emit,
  })
  return runtime
}
