/**
 * Opening a conversation's runtime, and the transcript that stays readable when there is no model
 * to open one with: a conversation whose model is gone still exists, so its window shows what was
 * said rather than refusing to open at all.
 */
import type { ChatMessage, RuntimeEvent, ThinkingLevel, Undef } from '@alpha/core'
import type { Api, Model } from '@earendil-works/pi-ai'
import { ConversationRuntime, type PermissionPorts } from './conversation-runtime.ts'
import type { DecisionLog } from './decisions.ts'
import type { ModelRuntime } from './models.ts'
import { readSessionTranscript } from './session-files.ts'
import { buildSystemPrompt } from './system-prompt.ts'

export interface OpeningPorts {
  sessionsRoot: string
  decisions: DecisionLog
  permissions: () => PermissionPorts
  modelRuntime: () => ModelRuntime
  /** Where the new runtime sends everything it has to say. */
  emit: (event: RuntimeEvent) => void
}

export interface OpeningRequest {
  conversationId: string
  workspacePath: string
  model?: Model<Api>
  thinkingLevel: ThinkingLevel
}

/** What the runtime hands back when it opens, which is what this module answers with. */
type OpenedRuntime = Awaited<ReturnType<typeof ConversationRuntime.open>>

export interface Opened {
  runtime: Undef<ConversationRuntime>
  conversationId: string
  messages: ChatMessage[]
}

export async function tryOpen(ports: OpeningPorts, request: OpeningRequest): Promise<Opened> {
  const modelRuntime = ports.modelRuntime()
  const model = request.model ?? modelRuntime.defaultModel

  if (model === undefined) {
    const messages = await readSessionTranscript(
      {
        sessionsRoot: ports.sessionsRoot,
        workspacePath: request.workspacePath,
        conversationId: request.conversationId,
      },
      ports.decisions.opened(request.conversationId),
    )
    return { runtime: undefined, conversationId: request.conversationId, messages }
  }

  // The id is the manager's to mint, and it is minted before the runtime exists, so the ledger
  // that records how calls got past the gate can be opened for it first. The ledger is where a
  // decision is written; nothing downstream needs to know which file that is.
  const opened: OpenedRuntime = await ConversationRuntime.open({
    conversationId: request.conversationId,
    workspacePath: request.workspacePath,
    sessionsRoot: ports.sessionsRoot,
    modelRuntime,
    model,
    emit: ports.emit,
    systemPrompt: buildSystemPrompt({ workspacePath: request.workspacePath }),
    permissions: ports.permissions(),
    decisions: ports.decisions.opened(request.conversationId),
  })
  await opened.runtime.setThinkingLevel(request.thinkingLevel)
  return { runtime: opened.runtime, conversationId: opened.conversationId, messages: opened.messages }
}
