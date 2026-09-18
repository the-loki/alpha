/**
 * What the runtime tells the renderer, and what a conversation looks like to it. This is the
 * wire contract between the main process and the window: the runtime emits it, the reducer in
 * `transcript.ts` consumes it, and nothing else crosses.
 *
 * Every event names its conversation, because more than one can be running: the window shows a
 * single transcript, but a background conversation still streams, still fails, and still shows
 * up in the list.
 */

export interface ChatBlockText {
  kind: 'text'
  text: string
}

export interface ChatBlockThinking {
  kind: 'thinking'
  text: string
}

export type ChatBlock = ChatBlockText | ChatBlockThinking

export type ChatMessageStatus = 'streaming' | 'complete' | 'interrupted' | 'failed'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: ChatBlock[]
  createdAt: number
  status: ChatMessageStatus
  error?: string
}

export interface ConversationSummary {
  id: string
  workspacePath: string
  title: string
  createdAt: number
  updatedAt: number
  status: 'idle' | 'running'
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
  | { conversationId: string; type: 'run_failed'; message: string }
