/**
 * What the runtime tells the renderer, and what a conversation looks like to it. This is the
 * wire contract between the main process and the window: the runtime emits it, the reducer in
 * `transcript.ts` consumes it, and nothing else crosses.
 *
 * Every event names its conversation, because more than one can be running: the window shows a
 * single transcript, but a background conversation still streams, still fails, and still shows
 * up in the list.
 */

import type { PermissionLevel, RuleScope } from './permission.ts'
import type { ThinkingLevel } from './thinking.ts'
import type { ToolRisk } from './tools.ts'

export interface ChatBlockText {
  kind: 'text'
  text: string
}

export interface ChatBlockThinking {
  kind: 'thinking'
  text: string
}

export interface ToolDetails {
  /** The edit tool's own diff, rendered rather than recomputed. */
  diff?: string
  exitCode?: number
  truncated?: boolean
  /** Where the untruncated output went, when the tool truncated it. */
  fullOutputPath?: string
}

export type ToolStatus = 'running' | 'ok' | 'failed'

/**
 * Why a call ran, or why it did not. It is recorded on the row so a later review can tell an
 * auto-approved edit from one a person allowed, and a skipped one from a failed one.
 */
export type ApprovalKind = 'auto' | 'rule' | 'once' | 'always' | 'denied' | 'blocked'

export interface ApprovalRecord {
  kind: ApprovalKind
  /** The level in force when the decision was made. */
  level: PermissionLevel
  /** The user's reason, for a denial, or why the ladder blocked it. */
  reason?: string
  ruleId?: string
}

/** A call waiting on a person: everything the card needs to show what is about to run. */
export interface ApprovalRequest {
  requestId: string
  callId: string
  toolName: string
  risk: ToolRisk
  /** The command, or the path being changed. */
  summary: string
  /** The arguments as the model sent them. */
  raw: string
  /** The change being proposed, rendered as a diff, when the call is one that changes a file. */
  diff?: string
  /** Where it will run, so the card can say which folder it is about to touch. */
  cwd: string
  level: PermissionLevel
  requestedAt: number
}

/** What the gate knows when it asks: the broker adds the identity and the timestamp. */
export type ApprovalAsk = Omit<ApprovalRequest, 'requestId' | 'requestedAt'>

export interface ChatBlockTool {
  kind: 'tool'
  callId: string
  name: string
  risk: ToolRisk
  /** One line for the row: "src/index.ts", "rm -rf build". */
  summary: string
  /** The arguments as the model sent them, for the expanded view. */
  raw: string
  status: ToolStatus
  output: string
  details?: ToolDetails
  approval?: ApprovalRecord
  startedAt: number
  endedAt?: number
}

export type ChatBlock = ChatBlockText | ChatBlockThinking | ChatBlockTool

export type ChatMessageStatus = 'streaming' | 'complete' | 'interrupted' | 'failed'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: ChatBlock[]
  createdAt: number
  status: ChatMessageStatus
  error?: string
}

export interface ConversationModel {
  providerId: string
  modelId: string
}

export interface ConversationSummary {
  id: string
  workspacePath: string
  title: string
  createdAt: number
  updatedAt: number
  status: 'idle' | 'running'
  /** Empty strings mean no model has been chosen yet, which the composer reports. */
  model: ConversationModel
  thinkingLevel: ThinkingLevel
}

export type RuntimeEvent =
  | { conversationId: string; type: 'conversation_opened'; conversation: ConversationSummary; messages: ChatMessage[] }
  | { conversationId: string; type: 'conversation_updated'; conversation: ConversationSummary }
  | { conversationId: string; type: 'turn_started' }
  | { conversationId: string; type: 'user_message'; message: ChatMessage }
  | { conversationId: string; type: 'assistant_message_started'; messageId: string; createdAt: number }
  | { conversationId: string; type: 'assistant_text_delta'; messageId: string; delta: string }
  | { conversationId: string; type: 'assistant_thinking_delta'; messageId: string; delta: string }
  | { conversationId: string; type: 'assistant_message_finished'; messageId: string; interrupted: boolean }
  | { conversationId: string; type: 'turn_finished' }
  | {
      conversationId: string
      type: 'tool_started'
      callId: string
      name: string
      risk: ToolRisk
      summary: string
      raw: string
      /** How it got here: the ladder, a remembered rule, or a person's answer. */
      approval?: ApprovalRecord
      startedAt: number
    }
  | { conversationId: string; type: 'tool_output'; callId: string; output: string }
  | {
      conversationId: string
      type: 'tool_finished'
      callId: string
      status: ToolStatus
      output: string
      details?: ToolDetails
      endedAt: number
    }
  | { conversationId: string; type: 'approval_requested'; request: ApprovalRequest }
  | {
      conversationId: string
      type: 'approval_decided'
      requestId: string
      callId: string
      decision: 'once' | 'always' | 'deny'
      scope?: RuleScope
      reason?: string
    }
  | { conversationId: string; type: 'run_failed'; message: string }
